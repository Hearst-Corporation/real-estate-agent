/**
 * lib/assistant-ops/labels.ts — libellés PROPRES à l'assistant opérationnel (W9).
 *
 * Centralisés ici (ownership W9) plutôt qu'en dur dans les composants/route, en
 * attendant le reseed baseline de `lib/ui-strings.ts` par l'intégrateur (diff
 * souhaité décrit dans le rapport). Aucun texte visible en dur dans les .tsx.
 *
 * Réutilise le vocabulaire de rôle/étage déjà stabilisé côté conversion/réactivation
 * quand c'est pertinent, et n'ajoute QUE ce qui est nouveau (assistant, automatisation).
 */

import type { ProposeLabels } from "@/lib/assistant-ops/propose";
import type { AutomationStatus } from "@/lib/assistant-ops/types";
import type { ProposalFactor } from "@/lib/assistant-ops/types";

/** Libellé humain d'un étage de funnel (StageId). */
const STAGE_LABEL: Record<string, string> = {
  prospect: "Prospect",
  qualified: "Qualifié",
  engaged: "Engagé",
  proposal: "Offre / mandat",
  won: "Gagné",
};

/** Libellé humain d'un rôle de prospect. */
const ROLE_LABEL: Record<string, string> = {
  acquereur: "acquéreur",
  proprietaire: "propriétaire",
};

/** Libellés injectés dans le moteur de proposition (aucun texte en dur là-bas). */
export const PROPOSE_LABELS: ProposeLabels = {
  funnelLeak: (pct, stage) =>
    `${pct}% des pertes se concentrent à l'étage « ${stage} » — action corrective utile.`,
  funnelTitle: (stage) => `Réduire la fuite à l'étage « ${stage} »`,
  stageLabel: (stage) => STAGE_LABEL[stage] ?? stage,
  reactivationRationale: (name, days, role) =>
    `${name} (${role}) est sans activité depuis ${days} j — relance recommandée.`,
  reactivationTitle: (name) => `Relancer ${name}`,
  roleLabel: (role) => ROLE_LABEL[role] ?? role,
};

/** Libellés courts des facteurs de proposition (le « pourquoi si prioritaire »). */
export const FACTOR_LABEL: Record<ProposalFactor["factor"], string> = {
  // Facteurs hérités du score du centre d'actions.
  base: "Importance de la catégorie",
  priority: "Priorité élevée",
  overdue: "En retard",
  dueSoon: "Échéance imminente",
  signalStrength: "Signal marché fort",
  // Facteurs propres à l'assistant.
  funnelLeak: "Fuite de conversion",
  dormantDepth: "Inactivité prolongée",
  matchOpportunity: "Biens pertinents disponibles",
};

/** Textes de l'assistant (panneau dédié). */
export const ASSISTANT = {
  eyebrow: "Assistant",
  title: "Assistant opérationnel",
  subtitle: (n: number) =>
    n === 0
      ? "Aucune proposition — les signaux sont à jour."
      : `${n} proposition${n > 1 ? "s" : ""} d'action, dérivée${n > 1 ? "s" : ""} de vos signaux réels.`,
  empty: "Rien à proposer pour l'instant.",
  emptyHint:
    "Dès qu'un signal (relance, fuite de conversion, prospect dormant) ressort, une proposition apparaît ici.",
  computedAt: (t: string) => `Analysé à ${t}`,
  actions: {
    open: "Ouvrir la fiche",
    draft: "Préparer un brouillon",
    approval: "Voir l'approbation",
    drafting: "Création…",
    drafted: "Brouillon créé",
    draftFailed: "Échec de la création",
  },
  why: "Pourquoi cette proposition",
  urgency: {
    haute: "Urgent",
    normale: "À traiter",
    basse: "Quand possible",
  },
  automation: {
    title: "Automatisation",
    live: (n: number) =>
      `${n} agent${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""} — exécution automatisée possible.`,
    config: "Automatisation non connectée — analyse et propositions locales actives.",
    unavailable: "Automatisation indisponible — analyse locale conservée.",
  },
  signals: {
    live: "À jour",
    unavailable: "Indisponible",
    actions: "Actions CRM",
    conversion: "Conversion",
    reactivation: "Réactivation",
  },
  safety:
    "L'assistant ne fait rien tout seul : il propose, prépare des brouillons et route vers vos approbations. Aucun envoi sans votre validation.",
} as const;

/** Libellé humain de l'état d'automatisation (pour le badge). */
export function automationLabel(a: AutomationStatus): string {
  if (a.mode === "live") return ASSISTANT.automation.live(a.agentCount);
  if (a.mode === "config") return ASSISTANT.automation.config;
  return ASSISTANT.automation.unavailable;
}
