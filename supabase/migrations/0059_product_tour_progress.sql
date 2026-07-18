-- 0059_product_tour_progress.sql
-- Progression des visites guidées produit (product tour) — REA-ONBOARDING-011 / W2.
--
-- ADDITIF, NON DESTRUCTIF, IDEMPOTENT. Ne MODIFIE / ne SUPPRIME aucune table
-- existante. Re-jouable à froid sans effet de bord.
--
-- ⚠️ VERSIONNÉE, **NON APPLIQUÉE SUR GPU1** par ce worker (interdit sans
--    autorisation explicite). Application + reload du cache PostgREST :
--      ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' \
--        < supabase/migrations/0059_product_tour_progress.sql
--      ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
--
--    TANT QUE CETTE MIGRATION N'EST PAS APPLIQUÉE, la table n'existe pas :
--    PostgREST répond 42P01 / PGRST205 / PGRST202. Le code applicatif
--    (lib/onboarding/progress-db.ts + app/api/onboarding/*) DÉGRADE HONNÊTEMENT
--    en état `unsynced` / `persisted:false` — la visite reste jouable pour la
--    session courante, mais AUCUN faux succès n'est renvoyé.
--
-- ── ZÉRO PII ────────────────────────────────────────────────────────────────
-- Cette table ne contient QUE des identifiants de session (tenant/user), des
-- CLÉS DE TOUR (slugs techniques bornés par CHECK), des COMPTEURS et des
-- horodatages. Aucun nom, email, téléphone, adresse, contenu de formulaire, ni
-- texte libre saisi par l'utilisateur. Le CHECK sur `tour_key` interdit
-- structurellement d'y glisser du texte humain.
--
-- ── OWNER-SCOPE ─────────────────────────────────────────────────────────────
-- tenant_id + user_id sur chaque ligne. Le client PostgREST admin (service-role)
-- bypasse la RLS → l'owner-check applicatif reste obligatoire ET la policy RLS
-- tenant+user est posée pour le rôle `authenticated` (deny-by-default sinon).

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_product_tour_progress (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  user_id       uuid NOT NULL,

  -- Slug technique du tour (ex. 'cockpit-overview'). Le CHECK borne le format à
  -- un identifiant kebab/snake minuscule : impossible d'y stocker de la PII.
  tour_key      text NOT NULL
                  CHECK (tour_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),

  -- Version du script de tour. Bumper la version = re-proposer la visite à tous
  -- (nouvelle ligne), sans effacer l'historique de la version précédente.
  tour_version  integer NOT NULL DEFAULT 1
                  CHECK (tour_version >= 1 AND tour_version <= 9999),

  status        text NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started','in_progress','completed','dismissed')),

  -- Index de l'étape courante (0 = première). Compteur, jamais un contenu.
  current_step  integer NOT NULL DEFAULT 0
                  CHECK (current_step >= 0 AND current_step <= 500),

  -- Jalons de cycle de vie, stampés par le trigger (monotones : jamais réécrits).
  started_at    timestamptz,
  completed_at  timestamptz,
  dismissed_at  timestamptz,
  last_seen_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Une seule progression courante par (tenant, user, tour, version).
  -- C'est AUSSI la cible du ON CONFLICT de l'upsert PUT /api/onboarding/progress.
  CONSTRAINT user_product_tour_progress_scope_key
    UNIQUE (tenant_id, user_id, tour_key, tour_version)
);

-- ── INDEX : AUCUN index supplémentaire, volontairement ───────────────────────
-- L'index btree implicite de la contrainte UNIQUE ci-dessus, sur
--   (tenant_id, user_id, tour_key, tour_version)
-- couvre par PRÉFIXE la totalité des accès du code :
--   • GET    …WHERE tenant_id=? AND user_id=?                    → préfixe (1,2)
--   • GET    …WHERE tenant_id=? AND user_id=? AND tour_key=?     → préfixe (1,2,3)
--   • PUT    upsert ON CONFLICT (tenant,user,tour_key,version)   → index complet
--   • POST   reset : DELETE …WHERE tenant_id=? AND user_id=? [AND tour_key=?]
-- Aucune autre colonne n'est filtrée ni triée par le code → tout index de plus
-- serait un index mort payé à chaque écriture. On n'en pose donc aucun.

-- ── Stamping serveur des horodatages (updated_at + jalons de cycle de vie) ────
-- Les jalons ne sont JAMAIS acceptés depuis le client : ils sont dérivés du
-- `status` par la DB. Monotones — une fois posés, ils ne sont plus réécrits.
CREATE OR REPLACE FUNCTION public.user_product_tour_progress_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at   := now();
  NEW.last_seen_at := now();

  IF TG_OP = 'UPDATE' THEN
    -- Immuables / monotones : le payload ne peut ni les effacer ni les remonter.
    NEW.created_at   := OLD.created_at;
    NEW.started_at   := COALESCE(OLD.started_at,   NEW.started_at);
    NEW.completed_at := COALESCE(OLD.completed_at, NEW.completed_at);
    NEW.dismissed_at := COALESCE(OLD.dismissed_at, NEW.dismissed_at);
  END IF;

  IF NEW.status = 'in_progress' AND NEW.started_at   IS NULL THEN NEW.started_at   := now(); END IF;
  IF NEW.status = 'completed'   AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  IF NEW.status = 'dismissed'   AND NEW.dismissed_at IS NULL THEN NEW.dismissed_at := now(); END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_product_tour_progress_touch ON public.user_product_tour_progress;
CREATE TRIGGER user_product_tour_progress_touch
  BEFORE INSERT OR UPDATE ON public.user_product_tour_progress
  FOR EACH ROW EXECUTE FUNCTION public.user_product_tour_progress_touch();

-- ── RLS : deny-by-default, isolation tenant + owner ──────────────────────────
-- Aucun GRANT à anon → aucun accès anonyme. Le service-role bypasse la RLS,
-- d'où l'owner-check applicatif systématique côté routes.
ALTER TABLE public.user_product_tour_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant user_product_tour_progress" ON public.user_product_tour_progress;
CREATE POLICY "tenant user_product_tour_progress" ON public.user_product_tour_progress
  FOR ALL TO authenticated
  USING      (tenant_id = (select public.current_tenant_id()) AND (select auth.uid()) = user_id)
  WITH CHECK (tenant_id = (select public.current_tenant_id()) AND (select auth.uid()) = user_id);

COMMENT ON TABLE public.user_product_tour_progress IS
  'Progression des visites guidées produit (REA-ONBOARDING-011). Clés de tour + compteurs + horodatages uniquement — zéro PII. Isolée par tenant_id + user_id.';

COMMIT;
