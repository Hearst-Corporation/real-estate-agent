-- 0046 — Index tenant sur auth_credentials (isolation multi-tenant admin).
--
-- Contexte (REA-M04-01) : le durcissement de l'espace admin borne désormais toute
-- action ciblant un utilisateur au tenant de l'acteur (lib/server/auth-admin.ts) :
--   - reset MFA (app/api/admin/mfa-reset) → isSameTenant(actor, target) avant écriture ;
--   - lecture du journal d'audit (app/api/admin/audit-log) → restreinte aux user_id du
--     tenant courant via listTenantUserIds().
--
-- Ces deux chemins interrogent auth_credentials par tenant_id
-- (`WHERE tenant_id = $1`) ou par user_id (déjà PK). L'accès par user_id est couvert
-- par la clé primaire ; l'accès par tenant_id ne l'était PAS → cet index le sert.
--
-- ADDITIF & IDEMPOTENT : aucune donnée touchée, aucune colonne ajoutée. CREATE INDEX
-- IF NOT EXISTS → rejouable. À appliquer sur gpu1 par l'intégrateur, PAS par le worker :
--   ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' < supabase/migrations/0046_auth_credentials_tenant_index.sql
--   ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'   # reload cache PostgREST (DDL)

create index if not exists idx_auth_credentials_tenant
  on public.auth_credentials (tenant_id);
