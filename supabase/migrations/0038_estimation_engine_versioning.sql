-- 0038_estimation_engine_versioning.sql
-- Additif, non destructif : traçabilité et auditabilité des estimations.
--
-- Contexte : le moteur de valorisation (lib/estimation) est déterministe mais
-- ne persistait ni la version de la méthode, ni la date réelle de calcul, ni
-- les alertes qualité, ni le statut de complétude des données. Sans version
-- moteur, une estimation remise au vendeur n'est pas auditable (impossible de
-- rejouer la méthode qui l'a produite). Ces colonnes sont toutes NULLABLE :
-- les estimations existantes restent valides, le code les remplit à partir du
-- prochain recalcul.
--
-- Aucune donnée existante n'est modifiée ou supprimée. Rollback en pied de
-- fichier. Backup pg_dump réalisé avant application (Mission 02).

alter table public.estimations
  add column if not exists engine_version text,
  add column if not exists valued_at      timestamptz,
  add column if not exists quality_alerts  jsonb,
  add column if not exists data_status     text;

-- Statut de complétude des données ayant servi au calcul.
-- 'complete'  : géoloc + DVF + (ADEME|défauts assumés) présents
-- 'partial'   : une source secondaire manque (confiance abaissée)
-- 'degraded'  : géoloc échouée / aucun comparable → valeur indicative
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'estimations_data_status_check'
  ) then
    alter table public.estimations
      add constraint estimations_data_status_check
      check (data_status is null or data_status in ('complete','partial','degraded'));
  end if;
end $$;

-- Index partiel : retrouver les estimations produites par une version de moteur
-- donnée (audit / recalcul de masse après changement de méthode).
create index if not exists idx_estimations_engine_version
  on public.estimations (engine_version)
  where engine_version is not null;

-- ROLLBACK (manuel, si nécessaire) :
--   drop index if exists idx_estimations_engine_version;
--   alter table public.estimations drop constraint if exists estimations_data_status_check;
--   alter table public.estimations
--     drop column if exists engine_version,
--     drop column if exists valued_at,
--     drop column if exists quality_alerts,
--     drop column if exists data_status;
