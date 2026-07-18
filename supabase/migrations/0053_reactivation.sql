-- 0053_reactivation.sql — Journal des relances de réactivation (W2).
--
-- OPTIONNEL. La détection des prospects dormants et la génération de brouillons
-- DÉRIVENT entièrement du réel (leads, prosp_criteres_acquereur, mandates,
-- visits, properties) et du brouillon Outbox (0050) : la feature fonctionne
-- SANS cette table. Elle sert uniquement à tracer quel prospect a déjà fait
-- l'objet d'un brouillon de relance, pour éviter les doublons dans une future
-- itération (dédup / cooldown). Aucune logique actuelle n'en dépend.
--
-- Multi-tenant + owner : chaque ligne isolée par tenant_id + user_id. Le client
-- service-role (PostgREST admin) bypass RLS → owner-check applicatif obligatoire.
--
-- ⚠️ VERSIONNÉ, NON APPLIQUÉ (interdit d'appliquer sur gpu1 depuis un worker).
-- Additif + idempotent : ne casse rien s'il est rejoué. La feature dégrade
-- proprement si la table est absente (aucun accès n'y est fait à ce stade).

create table if not exists public.reactivation_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  user_id       uuid not null,
  -- Ressource pivot ayant produit le candidat (lead / critère / mandat).
  source_id     uuid not null,
  role          text not null,
  lead_id       uuid,
  -- Brouillon Outbox généré (si créé). Historique conservé même si le draft part.
  draft_id      uuid,
  jours_inactif integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint reactivation_log_role_chk
    check (role in ('acquereur', 'proprietaire')),
  constraint reactivation_log_jours_chk
    check (jours_inactif >= 0)
);

-- FK souples vers leads / outbox_drafts SI ces tables existent (schéma partiel).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'leads') then
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_name = 'reactivation_log_lead_fk' and table_name = 'reactivation_log'
    ) then
      alter table public.reactivation_log
        add constraint reactivation_log_lead_fk
        foreign key (lead_id) references public.leads(id) on delete set null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'outbox_drafts') then
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_name = 'reactivation_log_draft_fk' and table_name = 'reactivation_log'
    ) then
      alter table public.reactivation_log
        add constraint reactivation_log_draft_fk
        foreign key (draft_id) references public.outbox_drafts(id) on delete set null;
    end if;
  end if;
end $$;

-- Index : dédup par prospect (tenant + source), listing owner, FK.
create index if not exists reactivation_log_source_idx
  on public.reactivation_log (tenant_id, source_id, created_at desc);
create index if not exists reactivation_log_owner_idx
  on public.reactivation_log (tenant_id, user_id, created_at desc);
create index if not exists reactivation_log_lead_idx
  on public.reactivation_log (lead_id);
create index if not exists reactivation_log_draft_idx
  on public.reactivation_log (draft_id);

-- RLS : isolation tenant (le service-role bypass, owner-check applicatif reste dû).
alter table public.reactivation_log enable row level security;

drop policy if exists reactivation_log_tenant_isolation on public.reactivation_log;
create policy reactivation_log_tenant_isolation on public.reactivation_log
  using (tenant_id = current_setting('request.jwt.claims.tenant_id', true))
  with check (tenant_id = current_setting('request.jwt.claims.tenant_id', true));

comment on table public.reactivation_log is
  'Journal (optionnel) des relances de réactivation W2 : dédup/cooldown futur. La feature dérive du réel sans cette table.';
