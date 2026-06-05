-- ─── CRM immobilier : properties · leads · visits · mandates ─────────────────
-- Pattern : owner (user_id) + tenant (tenant_id) ; RLS owner+tenant ; index sur chaque FK.
-- set_updated_at() existe déjà (0007).

-- ─── properties (biens) ──────────────────────────────────────────────────────

create table if not exists properties (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  tenant_id     text not null default 'real-estate-agent',

  -- workflow commercial
  status        text not null default 'prospect'
                check (status in ('prospect','estimation','mandat','en_vente','sous_offre','vendu','archive')),

  -- descriptif
  title         text,
  property_type text,
  address       text,
  city          text,
  postal_code   text,
  surface       numeric,
  rooms         int,
  bedrooms      int,

  -- prix
  asking_price  numeric,
  estimated_value numeric,

  -- liens
  estimation_id uuid references estimations(id) on delete set null,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_properties_updated_at
  before update on properties
  for each row execute function public.set_updated_at();

-- ─── leads ───────────────────────────────────────────────────────────────────

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  tenant_id     text not null default 'real-estate-agent',

  -- pipeline
  status        text not null default 'nouveau'
                check (status in ('nouveau','contacte','qualifie','visite','offre','gagne','perdu')),
  kind          text not null default 'acheteur'
                check (kind in ('acheteur','vendeur')),

  -- contact
  full_name     text not null,
  email         text,
  phone         text,
  source        text,

  -- intérêt
  budget_min    numeric,
  budget_max    numeric,
  property_id   uuid references properties(id) on delete set null,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_leads_updated_at
  before update on leads
  for each row execute function public.set_updated_at();

-- ─── visits (visites) ────────────────────────────────────────────────────────

create table if not exists visits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  tenant_id     text not null default 'real-estate-agent',

  status        text not null default 'planifiee'
                check (status in ('planifiee','confirmee','realisee','annulee','no_show')),

  property_id   uuid references properties(id) on delete cascade,
  lead_id       uuid references leads(id) on delete set null,

  scheduled_at  timestamptz not null,
  duration_min  int not null default 30,
  feedback      text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_visits_updated_at
  before update on visits
  for each row execute function public.set_updated_at();

-- ─── mandates (mandats) ──────────────────────────────────────────────────────

create table if not exists mandates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  tenant_id     text not null default 'real-estate-agent',

  status        text not null default 'brouillon'
                check (status in ('brouillon','actif','suspendu','expire','resilie','realise')),
  kind          text not null default 'simple'
                check (kind in ('simple','exclusif','semi_exclusif')),

  property_id   uuid references properties(id) on delete cascade,

  reference     text,
  asking_price  numeric,
  commission_pct numeric,
  signed_at     date,
  expires_at    date,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_mandates_updated_at
  before update on mandates
  for each row execute function public.set_updated_at();

-- ─── indexes (FK + filtres) ──────────────────────────────────────────────────

create index if not exists idx_properties_user    on properties(user_id);
create index if not exists idx_properties_tenant   on properties(tenant_id);
create index if not exists idx_properties_status   on properties(status);
create index if not exists idx_properties_estimation on properties(estimation_id);

create index if not exists idx_leads_user      on leads(user_id);
create index if not exists idx_leads_tenant     on leads(tenant_id);
create index if not exists idx_leads_status     on leads(status);
create index if not exists idx_leads_property   on leads(property_id);

create index if not exists idx_visits_user      on visits(user_id);
create index if not exists idx_visits_tenant     on visits(tenant_id);
create index if not exists idx_visits_status     on visits(status);
create index if not exists idx_visits_property   on visits(property_id);
create index if not exists idx_visits_lead       on visits(lead_id);
create index if not exists idx_visits_scheduled  on visits(scheduled_at);

create index if not exists idx_mandates_user     on mandates(user_id);
create index if not exists idx_mandates_tenant    on mandates(tenant_id);
create index if not exists idx_mandates_status    on mandates(status);
create index if not exists idx_mandates_property  on mandates(property_id);

-- ─── RLS owner + tenant ──────────────────────────────────────────────────────

alter table properties enable row level security;
alter table leads      enable row level security;
alter table visits     enable row level security;
alter table mandates   enable row level security;

create policy "tenant properties" on properties for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

create policy "tenant leads" on leads for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

create policy "tenant visits" on visits for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

create policy "tenant mandates" on mandates for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
