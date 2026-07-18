-- 0045_alert_approvals — Approbation humaine PERSISTÉE des envois sensibles gateway.
--
-- Durcissement A2 (REA-PLATFORM-003). `alerts.dispatch` ne doit JAMAIS émettre une
-- notification réelle (Twilio/Resend) sans une APPROBATION HUMAINE persistée, liée
-- à (tenant, acteur, agent, match, canal, hash du contenu), à USAGE UNIQUE et
-- expirable, avec cooldown/plafond/opt-out revérifiés AU MOMENT de l'envoi.
--
-- ⚠️ NON APPLIQUÉE sur gpu1 (interdit par le brief : aucune migration gpu1). Tant
-- que cette table n'existe pas en base, la vérification d'approbation (approval.ts)
-- fail-close : preuve introuvable → DENIED, AUCUN envoi. `alerts.dispatch` reste
-- donc UNAVAILABLE/DENIED en pratique — comportement voulu, honnête.
--
-- Additif, non destructif — aucune table existante modifiée. RLS activée SANS
-- policy permissive (deny par défaut) : table atteinte UNIQUEMENT par le serveur
-- en service-role (bypass RLS). Même pattern que 0044 (agent_gateway_*).

create table if not exists public.agent_alert_approvals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text        not null,
  actor_user_id uuid        not null,   -- humain qui approuve, appartenant au tenant
  agent_id      text        not null,   -- agent Aigent autorisé à dispatcher
  match_id      uuid        not null,   -- prosp_matchs.id concerné
  channel       text        not null
                  check (channel in ('whatsapp','email')),
  content_hash  text        not null,   -- hash du contenu approuvé (anti-substitution)
  status        text        not null default 'approved'
                  check (status in ('approved','consumed','revoked')),
  approved_by   uuid,                   -- traçabilité (même humain, redondance explicite)
  consumed_at   timestamptz,            -- posé à la consommation (usage unique)
  expires_at    timestamptz not null,   -- au-delà → invalide (fail-closed)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Au plus UNE approbation active par (tenant, match, canal, hash de contenu) :
-- empêche d'empiler des approbations pour le même envoi. La consommation passe le
-- statut à 'consumed' (l'index n'exige pas l'unicité globale, seulement l'active).
create unique index if not exists uq_agent_alert_approval_active
  on public.agent_alert_approvals (tenant_id, match_id, channel, content_hash)
  where status = 'approved';

create index if not exists idx_agent_alert_approval_lookup
  on public.agent_alert_approvals (tenant_id, agent_id, match_id, status);

drop trigger if exists trg_agent_alert_approval_updated_at on public.agent_alert_approvals;
create trigger trg_agent_alert_approval_updated_at
  before update on public.agent_alert_approvals
  for each row execute function public.set_updated_at();

alter table public.agent_alert_approvals enable row level security;
-- Deny par défaut : aucune policy → ni anon ni authenticated. Seul le service-role
-- (routes serveur) lit/écrit. L'approbation est CRÉÉE par un flux humain (hors
-- périmètre gateway) ; la gateway la CONSOMME atomiquement, une seule fois.

comment on table public.agent_alert_approvals is
  'Approbation humaine persistée des envois alerts.dispatch (HITL). Liée tenant/acteur/agent/match/canal/hash-contenu, usage unique, expirable. Consommée atomiquement par la gateway ; fail-closed si absente/expirée.';

-- Rollback (référence, non exécuté) :
--   drop table if exists public.agent_alert_approvals;
