-- 0056_share_events.sql
-- Suivi des partages et brochures — événements RÉELS sur les liens token.
--
-- W5 (REA-PRODUCT-008). Chaque ligne = un HIT SERVEUR RÉEL sur une route
-- publique portée par un token signé (brochure PDF `app/api/brochure/[token]`,
-- sélection off-market `app/offmarket/[token]`). AUCUN événement inventé :
-- l'insertion n'a lieu que dans le handler de la route publique, après
-- vérification de la signature du token. Un token invalide/expiré/révoqué ne
-- produit AUCUNE ligne (il est rejeté avant).
--
-- NON APPLIQUÉE ici (interdit gpu1) — à appliquer via :
--   ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' < supabase/migrations/0056_share_events.sql
--   ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
--
-- Anti-énumération : on ne stocke que le HASH du token (sha-256, jamais le token
-- en clair) + l'id de ressource déjà résolu. `ip_hash` est optionnel et haché
-- (jamais l'IP brute) pour une dé-duplication grossière sans PII exploitable.
-- Multi-tenant : tenant_id hérité de la ressource ; RLS deny-by-default alignée
-- sur current_tenant_id(). L'écriture publique passe par le service-role côté
-- serveur (bornée à une ressource déjà vérifiée), jamais par RLS anon.

BEGIN;

CREATE TABLE IF NOT EXISTS public.share_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL DEFAULT current_tenant_id(),
  -- Type de ressource partagée + son id déjà résolu (jamais le token en clair).
  resource_type text NOT NULL
                  CHECK (resource_type IN ('brochure','offmarket')),
  resource_id   uuid NOT NULL,
  -- Nature de l'événement observé côté serveur.
  --   share_open     : hit sur la route publique (ouverture/consultation réelle)
  --   share_feedback : l'acquéreur a laissé un verdict (off-market)
  kind          text NOT NULL
                  CHECK (kind IN ('share_open','share_feedback')),
  -- Hash sha-256 du token (identifie le lien sans le révéler ni permettre l'énum).
  token_hash    text NOT NULL,
  -- Hash optionnel de l'IP (jamais l'IP brute) — dé-dup grossière, pas de PII.
  ip_hash       text,
  ts            timestamptz NOT NULL DEFAULT now()
);

-- Lectures Timeline / Centre d'actions : par ressource et par tenant, triées ts.
CREATE INDEX IF NOT EXISTS share_events_resource_idx
  ON public.share_events (resource_type, resource_id, ts DESC);
CREATE INDEX IF NOT EXISTS share_events_tenant_ts_idx
  ON public.share_events (tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS share_events_token_idx
  ON public.share_events (token_hash);

-- RLS : deny-by-default, isolation par tenant. L'écriture publique se fait au
-- service-role (bypass RLS) bornée à une ressource déjà vérifiée par signature.
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_events_tenant ON public.share_events;
CREATE POLICY share_events_tenant ON public.share_events
  USING (tenant_id = (select current_tenant_id()))
  WITH CHECK (tenant_id = (select current_tenant_id()));

COMMIT;
