-- 0057_value_snapshots.sql — Historique de valeur immobilière (W6, RÉSERVÉ).
--
-- La feature « Valeur immobilière évolutive » DÉRIVE aujourd'hui l'historique
-- directement des `estimations` successives (recommended_price / market_value,
-- regroupées par property_id ou adresse) — AUCUNE table n'est requise pour le
-- runtime actuel. Cette migration est fournie pour un besoin FUTUR : persister
-- des snapshots de valeur découplés des estimations (ex. relevés de marché
-- périodiques, valeurs manuelles), sans recalcul.
--
-- Multi-tenant + owner : chaque ligne isolée par tenant_id + user_id.
-- Le client service-role (PostgREST admin) bypass RLS → le code applicatif DOIT
-- filtrer explicitement user_id + tenant_id (owner-check).
--
-- ⚠️ VERSIONNÉ, NON APPLIQUÉ (interdit d'appliquer sur gpu1 depuis un worker).
-- Additif + idempotent. Le code actuel n'en dépend PAS (dérivation LIVE des
-- estimations) : son absence ne dégrade rien.

create table if not exists public.value_snapshots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  user_id      uuid not null,
  -- Ancrage du bien : property_id si connu, sinon adresse normalisée (l'un requis).
  property_id  uuid,
  address_norm text,
  -- Valeur relevée (en euros, positive) + provenance explicable.
  value_eur    numeric(14, 2) not null,
  source       text not null default 'manual',
  -- Estimation d'origine si le snapshot en dérive (traçabilité).
  estimation_id uuid,
  captured_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint value_snapshots_value_chk
    check (value_eur > 0),
  constraint value_snapshots_source_chk
    check (source in ('estimation', 'market', 'manual')),
  constraint value_snapshots_anchor_chk
    check (property_id is not null or address_norm is not null)
);

-- FK sur chaque *_id (contrainte impérative back-end).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'properties') then
    alter table public.value_snapshots
      drop constraint if exists value_snapshots_property_id_fkey;
    alter table public.value_snapshots
      add constraint value_snapshots_property_id_fkey
      foreign key (property_id) references public.properties (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'estimations') then
    alter table public.value_snapshots
      drop constraint if exists value_snapshots_estimation_id_fkey;
    alter table public.value_snapshots
      add constraint value_snapshots_estimation_id_fkey
      foreign key (estimation_id) references public.estimations (id) on delete set null;
  end if;
end $$;

-- Index sur les colonnes de WHERE / ORDER BY / JOIN.
create index if not exists value_snapshots_owner_idx
  on public.value_snapshots (tenant_id, user_id, captured_at desc);
create index if not exists value_snapshots_property_idx
  on public.value_snapshots (property_id) where property_id is not null;
create index if not exists value_snapshots_address_idx
  on public.value_snapshots (tenant_id, address_norm) where address_norm is not null;
create index if not exists value_snapshots_estimation_idx
  on public.value_snapshots (estimation_id) where estimation_id is not null;

-- RLS deny-by-default : isolation stricte par tenant (owner-check applicatif en plus).
alter table public.value_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'value_snapshots'
      and policyname = 'value_snapshots_tenant_isolation'
  ) then
    create policy value_snapshots_tenant_isolation
      on public.value_snapshots
      for all
      using (tenant_id = current_tenant_id())
      with check (tenant_id = current_tenant_id());
  end if;
end $$;

comment on table public.value_snapshots is
  'W6 — snapshots de valeur (RÉSERVÉ, non requis par le runtime qui dérive des estimations).';
