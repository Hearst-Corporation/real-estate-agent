/**
 * Visite « communications-hitl » v1 (REA-ONBOARDING-011, LOTS 5G + 5H).
 * =================================================================
 *
 * Deux surfaces, une seule idée : RIEN NE PART, RIEN NE S'EXÉCUTE SANS TOI.
 *   - `/outbox`    (5 étapes) : état réel des canaux, parcours d'un message,
 *                   correction, validation humaine, puis envoi — dans cet ordre.
 *   - `/approvals` (3 étapes) : l'action proposée par un agent, sa justification,
 *                   et la décision.
 *
 * LOT 10 — la visite MONTRE ces gestes, elle ne les déclenche jamais. Les
 * handlers correspondants sont verrouillés par `blockDuringTour()`
 * (cf. lib/onboarding/tour-guard.ts) tant que `tourActive` est vrai.
 *
 * HONNÊTETÉ (LOT 8) : aucun statut LIVE inventé. L'étape « transports » dit
 * l'état réel — Twilio en CONFIG, Resend configuré mais jamais éprouvé en envoi
 * réel — et l'écran lui-même rend l'état calculé côté serveur.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../tours";

const t = UI.onboarding.tours["communications-hitl"];

/** Ancres `data-tour-id` posées sur les composants RESPONSABLES des actions. */
export const COMMUNICATIONS_ANCHORS = {
  /** OutboxBoard — bandeau d'état réel des canaux (LIVE / CONFIG). */
  transports: "outbox-transports",
  /** OutboxBoard — barre d'onglets de statut (Brouillon/Validé/Envoyé/Échec). */
  statusTabs: "outbox-status-tabs",
  /** OutboxBoard — rangée d'actions du 1er brouillon (Modifier/Valider/Envoyer). */
  draftActions: "outbox-draft-actions",
  /** ApprovalsInbox — file des actions proposées par les agents. */
  pending: "approvals-pending",
  /** ApprovalsInbox — boutons Approuver / Rejeter de la 1re ligne. */
  decision: "approvals-decision",
} as const;

const OUTBOX_ROUTE = "/outbox";
const APPROVALS_ROUTE = "/approvals";

export const communicationsHitlTour = defineTour({
  key: "communications-hitl",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: OUTBOX_ROUTE,
  steps: [
    /* ---- Outbox (LOT 5G) ---- */
    {
      id: "transports",
      anchor: COMMUNICATIONS_ANCHORS.transports,
      route: OUTBOX_ROUTE,
      title: t.steps.transports.title,
      body: t.steps.transports.body,
      consequence: t.steps.transports.consequence,
      placement: "bottom",
    },
    {
      id: "tabs",
      anchor: COMMUNICATIONS_ANCHORS.statusTabs,
      route: OUTBOX_ROUTE,
      title: t.steps.tabs.title,
      body: t.steps.tabs.body,
      consequence: t.steps.tabs.consequence,
      placement: "bottom",
    },
    // Les trois étapes suivantes pointent la même rangée d'actions : c'est le
    // composant réellement responsable de modifier, valider puis envoyer.
    // Aucun brouillon en liste → l'ancre est absente, l'explication reste
    // affichée au centre (onMissing "center", jamais de blocage).
    {
      id: "edit",
      anchor: COMMUNICATIONS_ANCHORS.draftActions,
      route: OUTBOX_ROUTE,
      title: t.steps.edit.title,
      body: t.steps.edit.body,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "validate",
      anchor: COMMUNICATIONS_ANCHORS.draftActions,
      route: OUTBOX_ROUTE,
      title: t.steps.validate.title,
      body: t.steps.validate.body,
      consequence: t.steps.validate.consequence,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "send",
      anchor: COMMUNICATIONS_ANCHORS.draftActions,
      route: OUTBOX_ROUTE,
      title: t.steps.send.title,
      body: t.steps.send.body,
      consequence: t.steps.send.consequence,
      placement: "auto",
      onMissing: "center",
    },

    /* ---- Approbations (LOT 5H) ---- */
    {
      id: "proposal",
      anchor: COMMUNICATIONS_ANCHORS.pending,
      route: APPROVALS_ROUTE,
      title: t.steps.proposal.title,
      body: t.steps.proposal.body,
      consequence: t.steps.proposal.consequence,
      placement: "auto",
      // La file est chargée côté serveur puis rafraîchie : on laisse le temps.
      waitMs: 6000,
    },
    {
      id: "justification",
      anchor: COMMUNICATIONS_ANCHORS.pending,
      route: APPROVALS_ROUTE,
      title: t.steps.justification.title,
      body: t.steps.justification.body,
      consequence: t.steps.justification.consequence,
      placement: "auto",
    },
    {
      id: "decision",
      anchor: COMMUNICATIONS_ANCHORS.decision,
      route: APPROVALS_ROUTE,
      title: t.steps.decision.title,
      body: t.steps.decision.body,
      consequence: t.steps.decision.consequence,
      placement: "auto",
      // File vide → pas de boutons de décision : on explique au centre.
      onMissing: "center",
    },
  ],
});
