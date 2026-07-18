/**
 * lib/assistant-ops/derive-labels.ts — libellés de dérivation du centre d'actions.
 *
 * Réutilise `UI.dashboard.center.*` (aucun texte en dur) pour alimenter
 * `buildActionCenter` depuis la couche assistant, exactement comme la route
 * `/api/action-center`. Factorisé ici pour ne pas dupliquer la table de libellés.
 */

import { UI } from "@/lib/ui-strings";
import type { DeriveLabels } from "@/lib/actions/derive";

export function deriveLabels(): DeriveLabels {
  const c = UI.dashboard.center;
  return {
    staleFor: c.reasons.staleFor,
    visitWith: c.reasons.visitWith,
    today: c.groups.today,
    rdvOn: () => c.reasons.rdvOn,
    estimationResume: c.reasons.estimationResume,
    acquereurNoProposal: c.reasons.acquereurNoProposal,
    matchToReview: c.reasons.matchToReview,
    proprietaireToCall: c.reasons.proprietaireToCall,
    mandateDraft: c.reasons.mandateDraft,
    taskDue: c.reasons.taskDue,
    taskOverdue: c.reasons.taskOverdue,
    taskOpen: c.reasons.taskOpen,
    validationNeeded: c.reasons.validationNeeded,
    fallbackLead: c.fallback.lead,
    fallbackProperty: c.fallback.property,
    fallbackEstimation: c.fallback.estimation,
    fallbackMandate: c.fallback.mandate,
    fallbackCritere: c.fallback.critere,
  };
}
