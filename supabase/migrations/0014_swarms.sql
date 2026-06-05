-- Table swarm_runs : historique local des runs MySwarms
create table if not exists public.swarm_runs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'real-estate-agent',
  user_id     uuid not null references auth.users(id) on delete cascade,
  swarm_id    text not null,
  run_id      text not null unique,
  status      text not null default 'pending' check (status in ('pending','running','done','failed','error')),
  result      jsonb,
  steps       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists swarm_runs_tenant_swarm_idx on public.swarm_runs(tenant_id, swarm_id);
create index if not exists swarm_runs_run_id_idx on public.swarm_runs(run_id);

alter table public.swarm_runs enable row level security;

create policy "tenant_isolation" on public.swarm_runs
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
