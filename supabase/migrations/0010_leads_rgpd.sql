-- 0010_leads_rgpd
-- RGPD leads : nature juridique (orthogonale à `kind` acheteur/vendeur),
-- audit du consentement, et persistance de l'enrichissement B2B.
-- type_personne NOT NULL DEFAULT 'particulier' → backfill l'existant en "bloqué"
-- (le plus sûr : la garde A8b est une allow-list pro/societe/sci/agence).

alter table public.leads
  add column if not exists type_personne text not null default 'particulier'
    check (type_personne in ('particulier','professionnel','societe','sci','agence')),
  add column if not exists consent_at timestamptz,
  add column if not exists consent_source text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enriched_source text,
  add column if not exists enriched_data jsonb;

comment on column public.leads.type_personne is
  'Nature juridique (orthogonale à kind). Garde RGPD enrich : seuls pro/societe/sci/agence enrichissables.';
