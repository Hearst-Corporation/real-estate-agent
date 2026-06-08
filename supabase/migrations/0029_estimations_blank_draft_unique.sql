-- Au plus UN draft vierge (property/field_status vides) par (user, tenant).
-- Tue le double-INSERT du flux /estimations/new (Strict Mode double-mount,
-- double-clic, retour navigateur) à la racine : la 2e création échoue (23505),
-- l'API attrape et renvoie le draft existant.
create unique index if not exists estimations_one_blank_draft_per_user
  on public.estimations (user_id, tenant_id)
  where status = 'draft'
    and property = '{}'::jsonb
    and field_status = '{}'::jsonb;
