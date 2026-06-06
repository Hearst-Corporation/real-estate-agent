-- 0016_prosp_prospects_criteres — prospects chasse mandat + critères acquéreur
create table if not exists public.prosp_prospects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete set null,
  nom         text not null,
  telephone   text,
  email       text,
  zones       jsonb not null default '[]',
  score_min   smallint not null default 60,
  actif       boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index prosp_prospects_tenant_idx on public.prosp_prospects (tenant_id, user_id);
alter table public.prosp_prospects enable row level security;
create policy "owner_all" on public.prosp_prospects for all using (
  tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid()
);

create table if not exists public.prosp_criteres_acquereur (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete set null,
  nom             text not null,
  type_bien       text[],
  budget_min      numeric(14,2),
  budget_max      numeric(14,2),
  surface_min     numeric(8,2),
  surface_max     numeric(8,2),
  pieces_min      smallint,
  pieces_max      smallint,
  zones           jsonb not null default '[]',
  terrasse        text not null default 'indifferent',
  parking         text not null default 'indifferent',
  ascenseur       text not null default 'indifferent',
  jardin          text not null default 'indifferent',
  piscine         text not null default 'indifferent',
  dpe_max         text,
  actif           boolean not null default true,
  alerte_email    boolean not null default true,
  alerte_whatsapp boolean not null default false,
  telephone       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index prosp_criteres_tenant_idx on public.prosp_criteres_acquereur (tenant_id, user_id);
alter table public.prosp_criteres_acquereur enable row level security;
create policy "owner_all" on public.prosp_criteres_acquereur for all using (
  tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid()
);
