create table if not exists tenant_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  user_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);
create index if not exists idx_tenant_memory_tenant on tenant_memory(tenant_id, created_at desc);
create index if not exists idx_tenant_memory_user on tenant_memory(user_id);
alter table tenant_memory enable row level security;
create policy "tenant memory" on tenant_memory for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
