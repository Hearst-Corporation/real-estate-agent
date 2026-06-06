-- 0018_property_photos.sql
-- Ajoute la galerie photos (R2) et les champs d'enrichissement immobilier.

-- ─── Colonnes enrichissement sur properties ───────────────────────────────────
alter table properties
  add column if not exists dpe_letter        text check (dpe_letter in ('A','B','C','D','E','F','G')),
  add column if not exists ges_letter        text check (ges_letter in ('A','B','C','D','E','F','G')),
  add column if not exists year_built        int,
  add column if not exists floor             int,
  add column if not exists floor_total       int,
  add column if not exists has_elevator      boolean not null default false,
  add column if not exists has_parking       boolean not null default false,
  add column if not exists has_garden        boolean not null default false,
  add column if not exists has_terrace       boolean not null default false,
  add column if not exists has_pool          boolean not null default false,
  add column if not exists charges_monthly   numeric,
  add column if not exists taxe_fonciere     numeric,
  add column if not exists orientation       text check (orientation in ('N','S','E','O','NE','NO','SE','SO')),
  add column if not exists cellar            boolean not null default false,
  add column if not exists parking_count     int;

-- ─── Table property_photos ────────────────────────────────────────────────────
create table if not exists property_photos (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  tenant_id    text not null default 'real-estate-agent',
  storage_key  text not null,           -- clé R2 : properties/{propertyId}/{uuid}.{ext}
  url          text not null,           -- URL publique R2
  position     int  not null default 0, -- ordre affichage
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_property_photos_property on property_photos(property_id);
create index if not exists idx_property_photos_user     on property_photos(user_id);
create index if not exists idx_property_photos_tenant   on property_photos(tenant_id);
create index if not exists idx_property_photos_cover    on property_photos(property_id, is_cover);

alter table property_photos enable row level security;

create policy "tenant property_photos" on property_photos for all
  using (
    (select auth.uid()) = user_id
    and tenant_id = (select public.current_tenant_id())
  )
  with check (
    (select auth.uid()) = user_id
    and tenant_id = (select public.current_tenant_id())
  );
