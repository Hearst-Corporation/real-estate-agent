-- ─── Index composites hot-path : (user_id, tenant_id, status) ────────────────
--
-- Objectif : éviter le bitmap-and de 3 index séparés sur les lectures fréquentes
-- du type WHERE user_id=? AND tenant_id=? AND status=?.
-- Ordre : user_id en tête (vrai discriminant en contexte mono-tenant où
-- tenant_id = 'real-estate-agent' est quasi-constant et peu sélectif),
-- puis tenant_id (utile pour les plans multi-tenant futurs),
-- puis status (filtre optionnel, toujours dernier).
-- Les requêtes LIST réelles (app/api/properties, app/api/leads) filtrent
-- user_id + tenant_id SANS status → l'index sert aussi en prefix-scan.
--
-- À appliquer via MCP apply_migration quand validé (non appliqué automatiquement).
-- ─────────────────────────────────────────────────────────────────────────────

-- properties
create index if not exists idx_properties_user_tenant_status
  on properties (user_id, tenant_id, status);

-- leads
create index if not exists idx_leads_user_tenant_status
  on leads (user_id, tenant_id, status);

-- visits
create index if not exists idx_visits_user_tenant_status
  on visits (user_id, tenant_id, status);

-- estimations
create index if not exists idx_estimations_user_tenant_status
  on estimations (user_id, tenant_id, status);

-- missions
create index if not exists idx_missions_user_tenant_status
  on missions (user_id, tenant_id, status);
