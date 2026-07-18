-- 0050_offmarket_selection.sql
-- Off-market : sélection d'acquéreur partageable + feedback par bien.
--
-- W6 — Matching off-market portefeuille↔acquéreurs. L'agent constitue une
-- sélection de biens du portefeuille pour un acquéreur, génère un lien
-- partageable (token signé HS256, hors DB), et l'acquéreur donne un feedback
-- (interesse / pas_interesse / a_revoir) par bien via la page publique.
--
-- NON APPLIQUÉE ici (interdit gpu1) — à appliquer via :
--   ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' < supabase/migrations/0050_offmarket_selection.sql
--   ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
--
-- Multi-tenant : tenant_id + user_id sur la sélection ; RLS deny-by-default,
-- policies alignées sur current_tenant_id(). Le token de partage porte
-- l'autorisation publique (aucune session) → l'accès public passe par le
-- service-role côté serveur borné à selection_id, jamais par RLS anon.

BEGIN;

-- ── Sélection : un panier de biens constitué pour un acquéreur ───────────────
CREATE TABLE IF NOT EXISTS public.offmarket_selections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL DEFAULT current_tenant_id(),
  user_id       uuid NOT NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  critere_id    uuid REFERENCES public.prosp_criteres_acquereur(id) ON DELETE SET NULL,
  titre         text NOT NULL,
  -- Jeton opaque non prédictible utilisé dans le lien public (indépendant du
  -- JWT signé : sert d'ancre DB + révocation). Le JWT signé référence cet id.
  share_token   text NOT NULL,
  statut        text NOT NULL DEFAULT 'active'
                  CHECK (statut IN ('active','revoked')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offmarket_selections_share_token_key UNIQUE (share_token)
);

CREATE INDEX IF NOT EXISTS offmarket_selections_tenant_user_idx
  ON public.offmarket_selections (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS offmarket_selections_lead_idx
  ON public.offmarket_selections (lead_id);
CREATE INDEX IF NOT EXISTS offmarket_selections_critere_idx
  ON public.offmarket_selections (critere_id);
CREATE INDEX IF NOT EXISTS offmarket_selections_share_token_idx
  ON public.offmarket_selections (share_token);

-- ── Items : les biens du portefeuille inclus dans la sélection ───────────────
CREATE TABLE IF NOT EXISTS public.offmarket_selection_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL DEFAULT current_tenant_id(),
  selection_id  uuid NOT NULL REFERENCES public.offmarket_selections(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Score réel calculé par le moteur de matching (prospection) au moment de la
  -- constitution — jamais inventé. null si aucun critère associé.
  score_match   integer CHECK (score_match IS NULL OR (score_match >= 0 AND score_match <= 100)),
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offmarket_selection_items_unique UNIQUE (selection_id, property_id)
);

CREATE INDEX IF NOT EXISTS offmarket_selection_items_selection_idx
  ON public.offmarket_selection_items (selection_id);
CREATE INDEX IF NOT EXISTS offmarket_selection_items_property_idx
  ON public.offmarket_selection_items (property_id);
CREATE INDEX IF NOT EXISTS offmarket_selection_items_tenant_idx
  ON public.offmarket_selection_items (tenant_id);

-- ── Feedback : verdict de l'acquéreur par item (via lien public) ─────────────
CREATE TABLE IF NOT EXISTS public.offmarket_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  selection_id  uuid NOT NULL REFERENCES public.offmarket_selections(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.offmarket_selection_items(id) ON DELETE CASCADE,
  verdict       text NOT NULL
                  CHECK (verdict IN ('interesse','pas_interesse','a_revoir')),
  commentaire   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Un seul verdict courant par item (upsert par le POST public).
  CONSTRAINT offmarket_feedback_item_key UNIQUE (item_id)
);

CREATE INDEX IF NOT EXISTS offmarket_feedback_selection_idx
  ON public.offmarket_feedback (selection_id);
CREATE INDEX IF NOT EXISTS offmarket_feedback_item_idx
  ON public.offmarket_feedback (item_id);

-- ── RLS : deny-by-default, isolation par tenant ─────────────────────────────
ALTER TABLE public.offmarket_selections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offmarket_selection_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offmarket_feedback         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offmarket_selections_tenant ON public.offmarket_selections;
CREATE POLICY offmarket_selections_tenant ON public.offmarket_selections
  USING (tenant_id = (select current_tenant_id()))
  WITH CHECK (tenant_id = (select current_tenant_id()));

DROP POLICY IF EXISTS offmarket_selection_items_tenant ON public.offmarket_selection_items;
CREATE POLICY offmarket_selection_items_tenant ON public.offmarket_selection_items
  USING (tenant_id = (select current_tenant_id()))
  WITH CHECK (tenant_id = (select current_tenant_id()));

DROP POLICY IF EXISTS offmarket_feedback_tenant ON public.offmarket_feedback;
CREATE POLICY offmarket_feedback_tenant ON public.offmarket_feedback
  USING (tenant_id = (select current_tenant_id()))
  WITH CHECK (tenant_id = (select current_tenant_id()));

COMMIT;
