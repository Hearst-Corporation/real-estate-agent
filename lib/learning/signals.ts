/**
 * lib/learning/signals.ts — DÉRIVATION déterministe des critères satisfaits /
 * tolérés / bloquants d'un prospect, à partir de ses feedbacks RÉELS.
 *
 * 100 % pur, 100 % traçable : chaque classement est justifié par des COMPTES
 * (CriterionEvidence). Aucune probabilité, aucun modèle, aucun chiffre inventé.
 *
 * Règle de décision (par critère, sur les évènements où il était évaluable) :
 *   - bloquant  : ≥ MIN_EVIDENCE feedbacks NÉGATIFS où le critère manquait,
 *                 ET aucune tolérance positive plus forte → le prospect refuse.
 *   - tolere    : ≥ MIN_EVIDENCE feedbacks POSITIFS où le critère manquait
 *                 → le prospect valide malgré l'absence (ex. accepte +10% budget).
 *   - satisfait : ≥ MIN_EVIDENCE feedbacks POSITIFS où le critère était satisfait,
 *                 et pas de tolérance/blocage dominant → critère confirmé important.
 *   - insufficient_data : sinon (pas assez de preuve pour trancher).
 */

import {
  CRITERIA,
  type Criterion,
  type CriterionEvidence,
  type CriterionSignal,
  type CriterionStatus,
  type FeedbackEvent,
  type LearningProfile,
} from "./types";

/** Nombre minimum d'évènements concordants pour trancher un statut (jamais 1 seul). */
export const MIN_EVIDENCE = 2;

function emptyEvidence(): CriterionEvidence {
  return { positiveMet: 0, positiveUnmet: 0, negativeUnmet: 0, negativeMet: 0, evaluated: 0 };
}

/** Agrège les comptes d'un critère sur l'ensemble des évènements. */
function tally(events: FeedbackEvent[], criterion: Criterion): CriterionEvidence {
  const ev = emptyEvidence();
  for (const e of events) {
    const met = e.criteriaMet[criterion];
    if (met === undefined || met === null) continue; // non évaluable → ignoré
    ev.evaluated += 1;
    if (e.polarity === "positive") {
      if (met) ev.positiveMet += 1;
      else ev.positiveUnmet += 1;
    } else if (e.polarity === "negative") {
      if (met) ev.negativeMet += 1;
      else ev.negativeUnmet += 1;
    }
    // neutral : compté dans evaluated mais sans effet directionnel (à revoir/mitigé).
  }
  return ev;
}

const CRITERION_LABEL: Record<Criterion, string> = {
  zone: "la zone",
  budget: "le budget",
  surface: "la surface",
  pieces: "le nombre de pièces",
  typeBien: "le type de bien",
  confort: "les critères de confort",
};

/** Décision déterministe + phrase lisible dérivée des comptes. */
function classify(criterion: Criterion, ev: CriterionEvidence): { status: CriterionStatus; reason: string } {
  const label = CRITERION_LABEL[criterion];

  // Blocage : refus répété quand le critère manque, non compensé par une tolérance.
  if (ev.negativeUnmet >= MIN_EVIDENCE && ev.negativeUnmet > ev.positiveUnmet) {
    return {
      status: "bloquant",
      reason: `Refusé ${ev.negativeUnmet} fois quand ${label} ne correspondait pas — critère bloquant.`,
    };
  }

  // Tolérance : validé malgré l'absence du critère.
  if (ev.positiveUnmet >= MIN_EVIDENCE && ev.positiveUnmet >= ev.negativeUnmet) {
    return {
      status: "tolere",
      reason: `Retenu ${ev.positiveUnmet} fois alors que ${label} ne correspondait pas — le prospect tolère cet écart.`,
    };
  }

  // Confirmé important : validé quand le critère est satisfait.
  if (ev.positiveMet >= MIN_EVIDENCE) {
    return {
      status: "satisfait",
      reason: `Retenu ${ev.positiveMet} fois avec ${label} conforme — critère confirmé.`,
    };
  }

  return {
    status: "insufficient_data",
    reason: `Pas assez de feedback sur ${label} pour conclure.`,
  };
}

/**
 * Facteur de poids déterministe à appliquer par-dessus le moteur.
 *   satisfait          → 1.15 (léger renfort du critère confirmé)
 *   bloquant           → 1.30 (renforce l'importance : son absence pénalise plus)
 *   tolere             → 0.60 (assouplit : son absence pèse moins dans le classement)
 *   insufficient_data  → 1.00 (neutre — on ne touche à rien sans preuve)
 * Bornes fixes, pas de valeur libre ni continue → 100 % reproductible.
 */
function weightFactorFor(status: CriterionStatus): number {
  switch (status) {
    case "bloquant":
      return 1.3;
    case "satisfait":
      return 1.15;
    case "tolere":
      return 0.6;
    case "insufficient_data":
      return 1.0;
  }
}

/** Construit le signal complet (statut + evidence + facteur + raison) d'un critère. */
export function deriveCriterionSignal(events: FeedbackEvent[], criterion: Criterion): CriterionSignal {
  const evidence = tally(events, criterion);
  const { status, reason } = classify(criterion, evidence);
  return { criterion, status, evidence, weightFactor: weightFactorFor(status), reason };
}

/**
 * Profil d'apprentissage complet d'un prospect. `events` = feedbacks RÉELS déjà
 * normalisés (voir aggregate.ts). Aucun feedback → insufficientData=true, tous
 * les critères en `insufficient_data` (honnête).
 */
export function deriveLearningProfile(critereId: string, events: FeedbackEvent[]): LearningProfile {
  const signals = CRITERIA.map((c) => deriveCriterionSignal(events, c));
  const insufficientData = events.length === 0;
  return {
    critereId,
    totalFeedback: events.length,
    insufficientData,
    signals,
  };
}
