-- 0049_outbox.sql — Outbox de brouillons avec validation avant envoi (W5).
--
-- Un message destiné à un client/prospect est créé en BROUILLON (draft),
-- revu par l'humain (approved), et ne part QUE sur validation explicite —
-- et seulement si le canal d'envoi est réellement configuré (Resend/Twilio).
-- Sinon il reste 'approved' avec un état CONFIG honnête. JAMAIS de faux 'sent'.
--
-- Multi-tenant + owner : chaque ligne est isolée par tenant_id + user_id.
-- Le client service-role (PostgREST admin) bypass RLS → le code applicatif
-- DOIT filtrer explicitement user_id + tenant_id (owner-check).
--
-- ⚠️ VERSIONNÉ, NON APPLIQUÉ (interdit d'appliquer sur gpu1 depuis un worker).
-- La feature dégrade proprement si la table n'existe pas encore (code 42P01
-- → état UNAVAILABLE honnête côté route/page, jamais de crash).

create table if not exists public.outbox_drafts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  user_id     uuid not null,
  lead_id     uuid,
  channel     text not null,
  subject     text,
  body        text not null,
  status      text not null default 'draft',
  provider    text,
  provider_ref text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz,

  constraint outbox_drafts_channel_chk
    check (channel in ('email', 'sms', 'whatsapp')),
  constraint outbox_drafts_status_chk
    check (status in ('draft', 'approved', 'sent', 'failed', 'canceled')),
  constraint outbox_drafts_body_chk
    check (char_length(body) between 1 and 8000),
  constraint outbox_drafts_subject_chk
    check (subject is null or char_length(subject) <= 300)
);

-- FK optionnelle vers leads (si la table existe dans ce schéma). On la pose
-- en soft (validate ON, mais lead_id nullable) — un draft peut viser un
-- prospect hors CRM. Un lead supprimé n'efface pas l'historique du draft.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'leads') then
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_name = 'outbox_drafts_lead_fk'
        and table_name = 'outbox_drafts'
    ) then
      alter table public.outbox_drafts
        add constraint outbox_drafts_lead_fk
        foreign key (lead_id) references public.leads(id) on delete set null;
    end if;
  end if;
end $$;

-- Index : listing par tenant/statut (page outbox) + owner + FK.
create index if not exists outbox_drafts_tenant_status_idx
  on public.outbox_drafts (tenant_id, status, updated_at desc);
create index if not exists outbox_drafts_owner_idx
  on public.outbox_drafts (tenant_id, user_id);
create index if not exists outbox_drafts_lead_idx
  on public.outbox_drafts (lead_id);

-- updated_at auto.
create or replace function public.outbox_drafts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists outbox_drafts_touch on public.outbox_drafts;
create trigger outbox_drafts_touch
  before update on public.outbox_drafts
  for each row execute function public.outbox_drafts_touch_updated_at();

-- RLS : isolation tenant (le service-role bypass, owner-check applicatif reste dû).
alter table public.outbox_drafts enable row level security;

drop policy if exists outbox_drafts_tenant_isolation on public.outbox_drafts;
create policy outbox_drafts_tenant_isolation on public.outbox_drafts
  using (tenant_id = current_setting('request.jwt.claims.tenant_id', true))
  with check (tenant_id = current_setting('request.jwt.claims.tenant_id', true));

comment on table public.outbox_drafts is
  'Outbox de brouillons (W5) : DRAFT → APPROVED → SENT (envoi réel prouvé uniquement). Jamais de faux sent.';
