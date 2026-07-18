-- 0058_learning_signals.sql
-- Apprentissage commercial EXPLICABLE — cache d'agrégats de feedback par prospect.
--
-- REA-PRODUCT-008 / W7. ADDITIF, NON DESTRUCTIF, IDEMPOTENT. Ne MODIFIE / ne
-- SUPPRIME aucune table existante. Re-jouable à froid.
--
-- ⚠️ OPTIONNELLE — NON APPLIQUÉE SUR GPU1 par ce worker (SQL versionné uniquement).
--    Le calcul du profil (satisfait/toléré/bloquant) est DÉRIVÉ EN LIVE des
--    feedbacks réels (prosp_match_feedback + offmarket_feedback + visit_reports)
--    dans lib/learning — cette table n'est qu'un CACHE de matérialisation pour
--    accélérer/tracer les agrégats. La feature fonctionne SANS elle (dégradation
--    propre : lib/learning ne lit jamais cette table, il recalcule).
--    Application + reload PostgREST (SIGUSR1) = étape d'intégration / QA.
--
-- Vérité : chaque ligne stocke des COMPTES bruts (evidence) + le statut dérivé,
-- jamais un score opaque. Reproductible depuis les sources → auditable.
--
-- ── OWNER-SCOPE ──────────────────────────────────────────────────────────────
--   tenant_id + user_id : owner-check applicatif (service-role bypasse la RLS)
--   ET policy RLS tenant+user (deny anon).

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_signals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  user_id        uuid NOT NULL,
  critere_id     uuid NOT NULL
                   REFERENCES public.prosp_criteres_acquereur(id) ON DELETE CASCADE,
  -- Critère scoré par le moteur (miroir des clés de MATCH_WEIGHTS).
  criterion      text NOT NULL
                   CHECK (criterion IN ('zone','budget','surface','pieces','typeBien','confort')),
  -- Statut appris DÉRIVÉ des comptes (déterministe, cf. lib/learning/signals.ts).
  status         text NOT NULL
                   CHECK (status IN ('satisfait','tolere','bloquant','insufficient_data')),
  -- Preuve chiffrée (evidence) ayant produit le statut — traçabilité totale.
  positive_met   integer NOT NULL DEFAULT 0 CHECK (positive_met   >= 0),
  positive_unmet integer NOT NULL DEFAULT 0 CHECK (positive_unmet >= 0),
  negative_unmet integer NOT NULL DEFAULT 0 CHECK (negative_unmet >= 0),
  negative_met   integer NOT NULL DEFAULT 0 CHECK (negative_met   >= 0),
  evaluated      integer NOT NULL DEFAULT 0 CHECK (evaluated      >= 0),
  -- Facteur de poids déterministe appliqué au re-classement (borné, cf. rank.ts).
  weight_factor  numeric(4,2) NOT NULL DEFAULT 1.00
                   CHECK (weight_factor >= 0 AND weight_factor <= 3),
  computed_at    timestamptz NOT NULL DEFAULT now(),
  -- Un seul agrégat courant par (prospect, critère).
  CONSTRAINT learning_signals_critere_criterion_key UNIQUE (critere_id, criterion)
);

CREATE INDEX IF NOT EXISTS learning_signals_tenant_user_idx
  ON public.learning_signals (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS learning_signals_critere_idx
  ON public.learning_signals (critere_id);

-- ── RLS : deny anon, tenant+user pour authenticated (service-role bypass) ─────
ALTER TABLE public.learning_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant learning_signals" ON public.learning_signals;
CREATE POLICY "tenant learning_signals" ON public.learning_signals
  FOR ALL TO authenticated
  USING      (tenant_id = (select public.current_tenant_id()) AND (select auth.uid()) = user_id)
  WITH CHECK (tenant_id = (select public.current_tenant_id()) AND (select auth.uid()) = user_id);

COMMIT;
