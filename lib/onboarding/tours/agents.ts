/**
 * Visite « agents » v1 (REA-ONBOARDING-011, LOT 5I).
 * =================================================================
 *
 * 4 étapes sur `/agents` : le registre réel Aigent, les capacités et la
 * disponibilité, le lancement + suivi d'un run, les étapes de validation (HITL).
 *
 * VÉRITÉ (non négociable) : le runtime Aigent est en CONFIG sur cet
 * environnement — `AIGENT_RUNTIME_BASE_URL` / `AIGENT_RUNTIME_TOKEN` sont
 * absentes et le registre producteur est un skeleton (liste vide, run 404).
 * Cette visite l'EXPLIQUE au lieu de le masquer : aucun agent n'est simulé,
 * aucun run n'est fabriqué, aucun statut LIVE n'est affiché.
 * Conséquence directe : les ancres `agents-run` et `agents-hitl` sont
 * légitimement absentes tant qu'aucun agent n'est publié → `onMissing: "center"`
 * garde l'explication utile sans jamais bloquer l'interface.
 *
 * LOT 10 : « Lancer » et la décision HITL sont verrouillés pendant la visite
 * (`blockDuringTour`, cf. lib/onboarding/tour-guard.ts).
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../tours";

const t = UI.onboarding.tours.agents;

/** Ancres `data-tour-id` posées sur les composants RESPONSABLES des actions. */
export const AGENTS_ANCHORS = {
  /** AgentsCockpit — région du registre (cartes réelles, vide, ou non connecté). */
  registry: "agents-registry",
  /** AgentCard — bouton « Lancer » du 1er agent publié (absent si registre vide). */
  run: "agents-run",
  /** RunTracker — panneau de décision humaine d'un run en attente. */
  hitl: "agents-hitl",
} as const;

const AGENTS_ROUTE = "/agents";

export const agentsTour = defineTour({
  key: "agents",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: AGENTS_ROUTE,
  steps: [
    {
      id: "registry",
      anchor: AGENTS_ANCHORS.registry,
      route: AGENTS_ROUTE,
      title: t.steps.registry.title,
      body: t.steps.registry.body,
      // Frontière imposée : les agents sont publiés par Aigent, exploités ici.
      consequence: t.steps.registry.consequence,
      placement: "auto",
      waitMs: 6000,
    },
    {
      id: "capabilities",
      anchor: AGENTS_ANCHORS.registry,
      route: AGENTS_ROUTE,
      title: t.steps.capabilities.title,
      body: t.steps.capabilities.body,
      // Dit l'état CONFIG réel du runtime, sans inventer d'agent.
      consequence: t.steps.capabilities.consequence,
      placement: "auto",
    },
    {
      id: "run",
      anchor: AGENTS_ANCHORS.run,
      route: AGENTS_ROUTE,
      title: t.steps.run.title,
      body: t.steps.run.body,
      consequence: t.steps.run.consequence,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "hitl",
      anchor: AGENTS_ANCHORS.hitl,
      route: AGENTS_ROUTE,
      title: t.steps.hitl.title,
      body: t.steps.hitl.body,
      consequence: t.steps.hitl.consequence,
      placement: "auto",
      onMissing: "center",
    },
  ],
});
