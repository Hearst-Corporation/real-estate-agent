-- 0040_prospection_industrialization.sql
-- Additif, non destructif. Industrialisation du module Prospection (Mission 03).
--
-- Fondé sur le SCHÉMA RÉEL de la base gpu1 (vérifié via psql, pas sur
-- database.types.ts qui s'est révélé désynchronisé). Les tables prosp_annonces,
-- prosp_matchs, prosp_criteres_acquereur, prosp_ingestion_runs, prosp_prospects
-- existent déjà et sont conservées telles quelles.
--
-- Ce fichier AJOUTE :
--   1. Versionnement du moteur de scoring sur prosp_matchs
--   2. Historique de prix / versions d'annonce (ListingVersion)
--   3. Registre d'opt-out / exclusion RGPD (Exclusion)
--   4. Journal granulaire des tentatives de contact (ContactAttempt)
--   5. Idempotence applicative des runs d'ingestion
--   6. Liens CRM bidirectionnels sur l'annonce (lead / bien / estimation)
--
-- Toutes les colonnes sont NULLABLE, toutes les tables héritent du modèle
-- multi-tenant (tenant_id text) + owner (user_id). Backup pg_dump réalisé avant
-- application. Rollback en pied de fichier.

-- ── 1. Versionnement du moteur de matching ───────────────────────────────────
alter table public.prosp_matchs
  add column if not exists engine_version text;

create index if not exists idx_prosp_matchs_engine_version
  on public.prosp_matchs (engine_version)
  where engine_version is not null;

-- ── 2. Historique des versions d'annonce (prix, statut) ──────────────────────
-- Une ligne par changement significatif observé (baisse de prix, republication).
create table if not exists public.prosp_annonce_versions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  annonce_id   uuid not null references public.prosp_annonces(id) on delete cascade,
  prix         numeric,
  surface      numeric,
  statut       text,
  hash_dedup   text,
  snapshot     jsonb,
  observed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_prosp_annonce_versions_annonce
  on public.prosp_annonce_versions (annonce_id, observed_at desc);
create index if not exists idx_prosp_annonce_versions_tenant
  on public.prosp_annonce_versions (tenant_id);

-- ── 3. Registre d'opt-out / exclusion (RGPD démarchage) ──────────────────────
-- On stocke des HASH (jamais l'email/téléphone en clair) pour vérifier
-- l'exclusion avant tout contact.
create table if not exists public.prosp_optout (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  email_hash    text,
  telephone_hash text,
  raison        text,
  source        text,
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_prosp_optout_email
  on public.prosp_optout (tenant_id, email_hash)
  where email_hash is not null;
create unique index if not exists uq_prosp_optout_tel
  on public.prosp_optout (tenant_id, telephone_hash)
  where telephone_hash is not null;

-- ── 4. Tentatives de contact (granulaire, une ligne par tentative) ───────────
create table if not exists public.prosp_contact_attempts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null,
  user_id        uuid,
  annonce_id     uuid references public.prosp_annonces(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  canal          text not null check (canal in ('sms','whatsapp','email','phone')),
  statut         text not null default 'draft'
                   check (statut in ('draft','approved','sent','failed','replied','opted_out')),
  template_id    text,
  template_version text,
  idempotency_key text,
  provider       text,
  provider_ref   text,
  error          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);

create index if not exists idx_prosp_contact_attempts_annonce
  on public.prosp_contact_attempts (annonce_id);
create index if not exists idx_prosp_contact_attempts_tenant_created
  on public.prosp_contact_attempts (tenant_id, created_at desc);
-- Anti-double-envoi : une clé d'idempotence ne peut aboutir qu'à un envoi.
create unique index if not exists uq_prosp_contact_idem
  on public.prosp_contact_attempts (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- ── 5. Idempotence des runs d'ingestion ──────────────────────────────────────
create table if not exists public.prosp_idempotency_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  idem_key    text not null,
  body_hash   text,
  response    jsonb,
  status      text,
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_prosp_idem
  on public.prosp_idempotency_keys (tenant_id, idem_key);

-- ── 6. Liens CRM bidirectionnels sur l'annonce ───────────────────────────────
alter table public.prosp_annonces
  add column if not exists lead_id       uuid references public.leads(id)        on delete set null,
  add column if not exists property_id   uuid references public.properties(id)   on delete set null,
  add column if not exists estimation_id uuid references public.estimations(id)  on delete set null,
  add column if not exists demarchage_bloque boolean not null default false,
  add column if not exists opt_out_at    timestamptz;

create index if not exists idx_prosp_annonces_lead     on public.prosp_annonces (lead_id)       where lead_id is not null;
create index if not exists idx_prosp_annonces_property on public.prosp_annonces (property_id)   where property_id is not null;
create index if not exists idx_prosp_annonces_estim    on public.prosp_annonces (estimation_id) where estimation_id is not null;

-- ── ROLLBACK (manuel) ────────────────────────────────────────────────────────
--   drop table if exists public.prosp_annonce_versions;
--   drop table if exists public.prosp_optout;
--   drop table if exists public.prosp_contact_attempts;
--   drop table if exists public.prosp_idempotency_keys;
--   alter table public.prosp_matchs drop column if exists engine_version;
--   alter table public.prosp_annonces
--     drop column if exists lead_id, drop column if exists property_id,
--     drop column if exists estimation_id, drop column if exists demarchage_bloque,
--     drop column if exists opt_out_at;
