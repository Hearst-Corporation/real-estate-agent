-- 0041_prospection_seller_contact.sql
-- Additif, non destructif. Coordonnées vendeur sur les annonces, nécessaires
-- au module de contact (Mission 03). Toutes nullable, alimentées à
-- l'enrichissement / à l'ingestion selon la source. Appliqué sur gpu1.
--
-- Rollback :
--   alter table public.prosp_annonces
--     drop column if exists email_vendeur, drop column if exists telephone_vendeur,
--     drop column if exists nom_annonceur, drop column if exists type_annonceur;

alter table public.prosp_annonces
  add column if not exists email_vendeur     text,
  add column if not exists telephone_vendeur text,
  add column if not exists nom_annonceur     text,
  add column if not exists type_annonceur    text;
