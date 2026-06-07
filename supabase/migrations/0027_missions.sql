-- Missions — couche user-friendly au-dessus des swarms (Mission View).
-- Une mission = un objectif humain, un plan (architect), une suite de sous-runs
-- (orchestration des moments de décision côté Next : le moteur ne fait que de
-- l'atomique), des décisions, et un livrable. owner+tenant comme le reste du CRM.

create table if not exists missions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  tenant_id   text not null default 'real-estate-agent',

  title       text not null,
  objective   text not null,                 -- le brief utilisateur en clair
  status      text not null default 'planning'
    check (status in ('planning','running','awaiting_decision','done','failed','paused')),

  swarm_id    text,                           -- swarm créé via l'architect
  plan        jsonb,                          -- spec architect (agents/tasks) + phases dérivées
  input       jsonb not null default '{}'::jsonb,   -- cible/paramètres + réponses aux décisions
  decisions   jsonb not null default '[]'::jsonb,   -- [{question, options, chosen, at}]
  runs        jsonb not null default '[]'::jsonb,   -- [{run_id, label, status}]
  result      jsonb,                          -- livrable final consolidé

  entity_type text,                           -- lien métier optionnel (lead|property|mandate|...)
  entity_id   uuid,
  error       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_missions_user   on missions(user_id);
create index if not exists idx_missions_tenant on missions(tenant_id);
create index if not exists idx_missions_status on missions(status);

create trigger trg_missions_updated_at
  before update on missions
  for each row execute function public.set_updated_at();

alter table missions enable row level security;

create policy "tenant missions" on missions for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
