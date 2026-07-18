-- 0044_agent_gateway — Gateway métier server-to-server pour les agents Aigent.
--
-- Contrat source : docs/projects/real-estate-agent/tool-gateway.md (repo Aigent).
-- 14 interfaces domaine.action (listings/buyers/matching/alerts/valuations/crm),
-- toutes journalisées ici. Additif, non destructif — aucune table existante
-- modifiée. RLS activée SANS policy permissive (deny par défaut) : ces deux
-- tables sont forensiques/techniques, atteintes UNIQUEMENT par le serveur en
-- service-role (bypass RLS), jamais par un client authentifié PostgREST.
-- Même pattern que 0036 (auth_audit_log) et 0040 (prosp_idempotency_keys).

-- ── 1. Idempotence des écritures gateway ─────────────────────────────────────
-- Miroir exact du pattern prosp_idempotency_keys (0040) : reserve (insert,
-- conflit = course perdue) → lookup (status=completed → renvoie la réponse
-- mémorisée) → complete (persiste la réponse finale). Un rejeu avec la même
-- clé (tenant, interface, idem_key) ne produit jamais un second effet.
create table if not exists public.agent_gateway_idempotency_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  interface   text not null,           -- ex. "crm.create_lead"
  idem_key    text not null,
  body_hash   text,
  status      text not null default 'running'
                check (status in ('running','completed')),
  response    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uq_agent_gateway_idem
  on public.agent_gateway_idempotency_keys (tenant_id, interface, idem_key);

-- Trigger idempotent (create trigger n'accepte pas IF NOT EXISTS → drop d'abord,
-- même pattern que 0043 pour trg_rea_tasks_updated_at). Un 2e passage ne casse pas.
drop trigger if exists trg_agent_gateway_idem_updated_at on public.agent_gateway_idempotency_keys;
create trigger trg_agent_gateway_idem_updated_at
  before update on public.agent_gateway_idempotency_keys
  for each row execute function public.set_updated_at();

alter table public.agent_gateway_idempotency_keys enable row level security;
-- Deny par défaut : aucune policy → ni anon ni authenticated n'accède. Seul le
-- service-role (bypass RLS) lit/écrit cette table depuis les routes gateway.

-- ── 2. Audit log des appels gateway ──────────────────────────────────────────
-- Une ligne par appel (lecture ou écriture), quel que soit le statut de sortie
-- (AVAILABLE/UNAVAILABLE/DENIED/TIMEOUT). Piste d'audit non contournable —
-- portée par la gateway elle-même (§2 du contrat), jamais par l'agent appelant.
create table if not exists public.agent_gateway_audit_log (
  id             uuid primary key default gen_random_uuid(),
  interface      text not null,          -- ex. "crm.create_lead"
  tenant_id      text not null,
  user_id        uuid,                   -- acteur au nom duquel l'agent agit ; null si "system"
  agent_id       text,                   -- identifiant de l'agent appelant (Aigent), si fourni
  request_id     text not null,          -- id de corrélation généré par la gateway
  status         text not null
                   check (status in ('AVAILABLE','UNAVAILABLE','DENIED','TIMEOUT')),
  reason         text,                   -- raison courte (scope manquant, timeout, etc.)
  duration_ms    integer,
  created_at     timestamptz not null default now()
);

create index if not exists idx_agent_gateway_audit_interface_created
  on public.agent_gateway_audit_log (interface, created_at desc);
create index if not exists idx_agent_gateway_audit_tenant_created
  on public.agent_gateway_audit_log (tenant_id, created_at desc);
create index if not exists idx_agent_gateway_audit_request
  on public.agent_gateway_audit_log (request_id);

alter table public.agent_gateway_audit_log enable row level security;
-- Deny par défaut, même raison que ci-dessus (table forensique service-role only).

comment on table public.agent_gateway_idempotency_keys is
  'Idempotence applicative des 14 interfaces agent-gateway (tool-gateway.md). INSERT-ON-CONFLICT, jamais un second effet sur rejeu.';
comment on table public.agent_gateway_audit_log is
  'Audit non contournable de tout appel agent-gateway (lecture ou écriture) — interface, tenant, utilisateur, agent, statut de vérité.';

-- Rollback (référence, non exécuté) :
--   drop table if exists public.agent_gateway_audit_log;
--   drop table if exists public.agent_gateway_idempotency_keys;
