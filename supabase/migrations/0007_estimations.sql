-- ─── updated_at trigger function ─────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── estimations ─────────────────────────────────────────────────────────────

create table if not exists estimations (
  -- identity
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  tenant_id   text not null default 'real-estate-agent',

  -- workflow
  status      text not null default 'draft'
              check (status in ('draft','interviewing','recap','valuating','ready','archived')),
  confirmed_blocks jsonb not null default '[]',

  -- promoted scalar columns (fast queries / indexes)
  property_type   text,
  city            text,
  postal_code     text,
  insee_code      text,
  surface         numeric,
  market_value    numeric,
  recommended_price numeric,

  -- core payloads
  property      jsonb not null default '{}',
  field_status  jsonb not null default '{}',

  -- computed / enrichment
  market        jsonb,
  valuation     jsonb,
  sale_strategies jsonb,
  branding      jsonb,

  -- subsystem-D / data gaps
  pdf_key              text,
  pdf_url              text,
  pdf_generated_at     timestamptz,
  property_photo_key   text,
  surface_carrez_m2    numeric,
  charges_estimees_eur numeric,
  vue_perenne          boolean,

  -- timestamps
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_estimations_updated_at
  before update on estimations
  for each row execute function public.set_updated_at();

-- ─── estimation_messages ─────────────────────────────────────────────────────

create table if not exists estimation_messages (
  id             uuid primary key default gen_random_uuid(),
  estimation_id  uuid references estimations(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  tenant_id      text not null default 'real-estate-agent',
  role           text not null check (role in ('user','assistant','system')),
  content        text,
  tool_input     jsonb,
  block_index    int,
  created_at     timestamptz not null default now()
);

-- ─── indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_estimations_user   on estimations(user_id);
create index if not exists idx_estimations_tenant  on estimations(tenant_id);
create index if not exists idx_estimations_status  on estimations(status);
create index if not exists idx_estimations_city    on estimations(city);

create index if not exists idx_estimation_messages_estimation on estimation_messages(estimation_id);
create index if not exists idx_estimation_messages_tenant     on estimation_messages(tenant_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table estimations       enable row level security;
alter table estimation_messages enable row level security;

-- estimations: owner + tenant
create policy "tenant estimations" on estimations for all
  using (
    (select auth.uid()) = user_id
    and tenant_id = (select public.current_tenant_id())
  )
  with check (
    (select auth.uid()) = user_id
    and tenant_id = (select public.current_tenant_id())
  );

-- estimation_messages: via parent estimation
create policy "tenant estimation messages" on estimation_messages for all
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from estimations e
      where e.id = estimation_id
        and e.user_id = (select auth.uid())
        and e.tenant_id = (select public.current_tenant_id())
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from estimations e
      where e.id = estimation_id
        and e.user_id = (select auth.uid())
        and e.tenant_id = (select public.current_tenant_id())
    )
  );
