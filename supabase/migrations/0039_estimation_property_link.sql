-- ─── 0039 · Lien estimation → bien CRM (property_id) ─────────────────────────
-- Additive, nullable, non destructive. Permet à une estimation de savoir de
-- quel bien du CRM elle a été lancée (parcours « Estimer ce bien »).
--
-- FK souple vers properties(id) : les deux colonnes sont uuid (properties.id =
-- uuid PK, cf 0008_crm.sql ligne 8) → types compatibles, la FK ne casse pas.
-- ON DELETE SET NULL : supprimer un bien ne détruit pas son estimation (l'avis
-- de valeur reste consultable), il perd juste son rattachement.
-- Le lien inverse existe déjà : properties.estimation_id → estimations(id).

alter table public.estimations
  add column if not exists property_id uuid
  references public.properties(id) on delete set null;

create index if not exists idx_estimations_property_id
  on public.estimations(property_id)
  where property_id is not null;

-- ─── Rollback (NE PAS appliquer automatiquement) ─────────────────────────────
-- drop index if exists public.idx_estimations_property_id;
-- alter table public.estimations drop column if exists property_id;
