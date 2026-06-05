-- 0009_estimation_sources
-- Snapshot des réponses sources (DVF/cadastre/BAN/ADEME/listings) au moment de
-- la valorisation, pour rendre chaque estimation auditable et rejouable.
-- Colonne jsonb nullable (NULL = pas de snapshot). Hérite des policies RLS de la
-- table estimations (owner + tenant). Jamais filtrée → pas d'index.

alter table public.estimations
  add column if not exists sources_snapshot jsonb;

comment on column public.estimations.sources_snapshot is
  'Snapshot best-effort des réponses sources au moment de /value (auditabilité). Capé en taille côté applicatif.';
