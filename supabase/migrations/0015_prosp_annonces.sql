-- 0015_prosp_annonces — catalogue d'annonces tenant + ledger + config
create extension if not exists "pgcrypto";

create table if not exists public.prosp_config (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  key         text not null,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key)
);
alter table public.prosp_config enable row level security;
create policy "tenant_select" on public.prosp_config for select using (tenant_id = current_setting('app.tenant_id', true));
create policy "tenant_insert" on public.prosp_config for insert with check (tenant_id = current_setting('app.tenant_id', true));
create policy "tenant_update" on public.prosp_config for update using (tenant_id = current_setting('app.tenant_id', true));

create table if not exists public.prosp_annonces (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null,
  source           text not null,
  source_id        text not null,
  hash_dedup       text not null,
  duplicate_count  int not null default 0,
  type_bien        text not null,
  titre            text,
  description      text,
  prix             numeric(14,2),
  surface          numeric(8,2),
  pieces           smallint,
  chambres         smallint,
  code_postal      text,
  ville            text,
  departement      text,
  latitude         numeric(10,7),
  longitude        numeric(10,7),
  etage            smallint,
  ascenseur        boolean,
  terrasse         boolean,
  parking          boolean,
  jardin           boolean,
  piscine          boolean,
  dpe              text,
  annee_construction smallint,
  score_mandat     smallint,
  mandat_eligible  boolean not null default false,
  score_breakdown  jsonb,
  url              text,
  photos           jsonb default '[]',
  raw              jsonb,
  is_pap           boolean not null default false,
  date_publication timestamptz,
  date_modif       timestamptz,
  prix_precedent   numeric(14,2),
  republication    boolean not null default false,
  actif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, hash_dedup)
);
create index prosp_annonces_tenant_idx on public.prosp_annonces (tenant_id);
create index prosp_annonces_cp_idx     on public.prosp_annonces (tenant_id, code_postal);
create index prosp_annonces_actif_idx  on public.prosp_annonces (tenant_id, actif, updated_at desc);
alter table public.prosp_annonces enable row level security;
create policy "tenant_select" on public.prosp_annonces for select using (tenant_id = current_setting('app.tenant_id', true));

create table if not exists public.prosp_ingestion_runs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  provider     text not null,
  zones        jsonb not null default '[]',
  inserted     int not null default 0,
  updated      int not null default 0,
  duplicates   int not null default 0,
  errors       int not null default 0,
  status       text not null default 'running',
  error_detail text
);
alter table public.prosp_ingestion_runs enable row level security;
create policy "tenant_select" on public.prosp_ingestion_runs for select using (tenant_id = current_setting('app.tenant_id', true));
