-- 0043_platform_augmented_002.sql
-- REA-PLATFORM-002 — additif, backward-compatible (aucune opération destructive).
-- Habilite des fonctionnalités LIVE : préférences d'alertes + urgence acquéreur,
-- continuité estimation → propriétaire → mandat, centre d'actions (rea_tasks).
-- Idempotent (IF NOT EXISTS partout), transactionnel.

begin;

-- ─── A1 : acquéreurs / alertes (prosp_criteres_acquereur) ─────────────────────
alter table prosp_criteres_acquereur
  add column if not exists alerte_frequence text not null default 'off'
    check (alerte_frequence in ('immediate','quotidien','hebdo','off')),
  add column if not exists urgence text
    check (urgence is null or urgence in ('faible','normale','haute','urgente')),
  add column if not exists exclusions jsonb not null default '[]'::jsonb,
  add column if not exists criteres_secondaires jsonb not null default '{}'::jsonb;

-- ─── A1/A2 : leads (urgence + capacité de financement) ────────────────────────
alter table leads
  add column if not exists urgence text
    check (urgence is null or urgence in ('faible','normale','haute','urgente')),
  add column if not exists financement jsonb;

-- ─── A2 : continuité estimation → propriétaire → mandat ───────────────────────
alter table estimations
  add column if not exists owner_lead_id uuid references leads(id) on delete set null,
  add column if not exists decision text
    check (decision is null or decision in ('en_attente','a_relancer','mandat_signe','refuse','perdu')),
  add column if not exists next_action text,
  add column if not exists manual_adjustments jsonb not null default '[]'::jsonb;
create index if not exists idx_estimations_owner_lead
  on estimations(owner_lead_id) where owner_lead_id is not null;

-- ─── A3 : centre d'actions (rea_tasks) ────────────────────────────────────────
-- Tâche rattachée à une VRAIE entité métier (polymorphe : entity_type + entity_id,
-- pas de FK polymorphe). Owner-check applicatif (user_id + tenant_id) côté code.
create table if not exists rea_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tenant_id     text not null default 'real-estate-agent',
  entity_type   text not null
                check (entity_type in ('lead','property','estimation','mandate','visit','annonce','match','general')),
  entity_id     uuid,
  kind          text not null default 'suivi'
                check (kind in ('appel','message','relance','rdv','note','validation','suivi','autre')),
  title         text not null,
  priority      text not null default 'normale'
                check (priority in ('basse','normale','haute')),
  due_at        timestamptz,
  status        text not null default 'open'
                check (status in ('open','done','snoozed')),
  snoozed_until timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_rea_tasks_scope  on rea_tasks(tenant_id, user_id, status);
create index if not exists idx_rea_tasks_due     on rea_tasks(tenant_id, user_id, due_at) where status = 'open';
create index if not exists idx_rea_tasks_entity  on rea_tasks(entity_type, entity_id);

drop trigger if exists trg_rea_tasks_updated_at on rea_tasks;
create trigger trg_rea_tasks_updated_at before update on rea_tasks
  for each row execute function public.set_updated_at();

alter table rea_tasks enable row level security;
drop policy if exists "tenant rea_tasks" on rea_tasks;
create policy "tenant rea_tasks" on rea_tasks for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

commit;
