#!/usr/bin/env bash
# test-migrations-dynamic.sh — HARNAIS DYNAMIQUE, Postgres LOCAL ÉPHÉMÈRE (jamais gpu1).
#
# Applique les prérequis minimaux + 0043 puis 0044 sur une base JETABLE, PUIS
# réapplique les deux (preuve d'idempotence : aucune erreur au 2e passage), vérifie
# les colonnes/tables attendues, et détruit la base. N'ouvre AUCUNE connexion gpu1.
#
# Cible : cluster Postgres LOCAL (postgresql@16 homebrew) sur la socket locale.
set -euo pipefail

export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
DBNAME="rea_migtest_$$"
ADMIN_DB="postgres"

echo "── Harnais migrations DYNAMIQUE (Postgres local éphémère : $DBNAME) ──"
echo "   Fichiers : 0043_platform_augmented_002.sql · 0044_agent_gateway.sql"
echo

cleanup() {
  psql -d "$ADMIN_DB" -q -c "drop database if exists \"$DBNAME\" with (force);" >/dev/null 2>&1 || true
  echo "   ↳ base jetable détruite."
}
trap cleanup EXIT

psql -d "$ADMIN_DB" -q -c "create database \"$DBNAME\";"
echo "✓ base jetable créée."

# ── Prérequis minimaux (miroir du socle gpu1, versions stub) ──────────────────
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create extension if not exists pgcrypto;

-- Fonctions référencées par les triggers/policies des migrations.
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.current_tenant_id() returns text
  language sql stable as $$ select 'real-estate-agent'::text $$;
-- auth.uid() stub (les policies rea_tasks l'utilisent).
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;

-- Tables préexistantes que 0043 ALTER (stubs minimaux : colonnes touchées + PK/FK).
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  updated_at timestamptz not null default now()
);
create table if not exists public.estimations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  updated_at timestamptz not null default now()
);
create table if not exists public.prosp_criteres_acquereur (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  updated_at timestamptz not null default now()
);
SQL
echo "✓ prérequis appliqués (auth.users, pgcrypto, set_updated_at, current_tenant_id, stubs leads/estimations/criteres)."
echo

# ── PASSE 1 : 0043 puis 0044 ──────────────────────────────────────────────────
echo "[PASSE 1] application initiale"
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -q -f "$MIG/0043_platform_augmented_002.sql"
echo "  ✓ 0043 appliquée"
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -q -f "$MIG/0044_agent_gateway.sql"
echo "  ✓ 0044 appliquée"
echo

# ── PASSE 2 : réapplication (PREUVE D'IDEMPOTENCE) ────────────────────────────
echo "[PASSE 2] réapplication (idempotence — doit passer sans erreur)"
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -q -f "$MIG/0043_platform_augmented_002.sql"
echo "  ✓ 0043 réappliquée sans erreur"
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -q -f "$MIG/0044_agent_gateway.sql"
echo "  ✓ 0044 réappliquée sans erreur"
echo

# ── VÉRIFICATION du schéma résultant ──────────────────────────────────────────
echo "[VÉRIF] colonnes & tables attendues"
CHECK=$(psql -d "$DBNAME" -tA -v ON_ERROR_STOP=1 <<'SQL'
with expected(kind, obj) as (values
  ('col','prosp_criteres_acquereur.alerte_frequence'),
  ('col','prosp_criteres_acquereur.urgence'),
  ('col','prosp_criteres_acquereur.exclusions'),
  ('col','prosp_criteres_acquereur.criteres_secondaires'),
  ('col','leads.urgence'),
  ('col','leads.financement'),
  ('col','estimations.owner_lead_id'),
  ('col','estimations.decision'),
  ('col','estimations.next_action'),
  ('col','estimations.manual_adjustments'),
  ('tbl','rea_tasks'),
  ('tbl','agent_gateway_audit_log'),
  ('tbl','agent_gateway_idempotency_keys')
)
select e.kind, e.obj,
  case
    when e.kind='tbl' then exists(
      select 1 from information_schema.tables t
      where t.table_schema='public' and t.table_name=e.obj)
    when e.kind='col' then exists(
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=split_part(e.obj,'.',1)
        and c.column_name=split_part(e.obj,'.',2))
  end as present
from expected e
order by e.kind desc, e.obj;
SQL
)
echo "$CHECK" | while IFS='|' read -r kind obj present; do
  [ -z "$kind" ] && continue
  if [ "$present" = "t" ]; then echo "  ✓ [$kind] $obj"; else echo "  ✗ [$kind] $obj ABSENT"; fi
done

MISSING=$(echo "$CHECK" | awk -F'|' '$3=="f"{c++} END{print c+0}')
echo
# Preuve supplémentaire : la FK estimations.owner_lead_id → leads(id) existe (une seule fois).
FKCOUNT=$(psql -d "$DBNAME" -tA -c "
  select count(*) from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
  where tc.constraint_type='FOREIGN KEY' and tc.table_name='estimations' and ccu.table_name='leads';")
echo "  ↳ FK estimations→leads présentes : $FKCOUNT (attendu 1)"
# Preuve : le trigger idempotent de 0044 n'existe qu'en un exemplaire après 2 passes.
TRIGCOUNT=$(psql -d "$DBNAME" -tA -c "
  select count(*) from pg_trigger where tgname='trg_agent_gateway_idem_updated_at' and not tgisinternal;")
echo "  ↳ trigger trg_agent_gateway_idem_updated_at : $TRIGCOUNT (attendu 1 — pas de doublon après 2 passes)"

echo
echo "────────────────────────────────────────────────────────────"
if [ "$MISSING" -eq 0 ] && [ "$FKCOUNT" = "1" ] && [ "$TRIGCOUNT" = "1" ]; then
  echo "✓ COHÉRENCE DYNAMIQUE PROUVÉE — 0043→0044 appliquées 2× sans erreur, schéma attendu complet, FK/trigger uniques."
  exit 0
else
  echo "✗ ÉCHEC dynamique : $MISSING objet(s) manquant(s), FK=$FKCOUNT, trigger=$TRIGCOUNT."
  exit 1
fi
