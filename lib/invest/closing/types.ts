/**
 * lib/invest/closing/types.ts — ⑤ Saga de Closing (DvP) : types de domaine.
 *
 * Orchestration DvP (blueprint C3) en fail-soft total. Ordre canonique NON
 * négociable (release en DERNIER) :
 *   garde → step1 fonds séquestre confirmés
 *         → step2 inscription DEEP (SOURCE DE VÉRITÉ, I1, d'ABORD)
 *         → step3 mint ERC-3643 (MIROIR, idempotent)
 *         → step4 réconciliation DEEP↔chaîne
 *         → step5 release séquestre → SPV (en DERNIER)
 * Compensation (échec AVANT step5) = refund intégral + souscriptions→refunded.
 */

/** Étapes canoniques de la saga (ordre = valeur). */
export type ClosingStep =
  | "guard" // conditions suspensives + garde 4-eyes
  | "escrow_confirm" // step1 — fonds en séquestre confirmés
  | "deep_inscription" // step2 — inscription DEEP (vérité, d'abord)
  | "token_mint" // step3 — mint miroir (idempotent)
  | "reconciliation" // step4 — réconciliation DEEP↔chaîne
  | "escrow_release"; // step5 — release séquestre → SPV (en dernier)

/** Issue d'une étape. */
export type StepStatus = "ok" | "skipped" | "pending" | "failed";

/** Trace d'une étape exécutée (audit-loggée). */
export interface ClosingStepResult {
  step: ClosingStep;
  status: StepStatus;
  detail?: string;
  /** Métriques utiles (ex. nb inscrites, nb pending, résultat réconciliation). */
  data?: Record<string, unknown>;
}

/** Issue globale de la saga. */
export type ClosingOutcome =
  | "closed" // DvP complet : DEEP + mint + réconciliation + release OK
  | "closed_legal_only" // DEEP OK + release OK, mint/réconciliation en fail-soft (testnet)
  | "guard_failed" // conditions suspensives / 4-eyes non remplies → rien fait
  | "compensated" // échec avant release → refund intégral appliqué
  | "paused"; // anomalie chaîne>DEEP → saga gelée avant release (DEEP prime)

/** État des conditions suspensives évaluées (garde). */
export interface ConditionsSnapshot {
  /** Toutes les CS `is_met=true`. */
  allMet: boolean;
  /** CS encore non remplies (codes). */
  unmet: string[];
  /** CS totales évaluées. */
  total: number;
}

/** Résultat complet de la saga (retourné + persistable). */
export interface ClosingResult {
  dealId: string;
  outcome: ClosingOutcome;
  steps: ClosingStepResult[];
  conditions: ConditionsSnapshot;
  /** True si une compensation (refund) a été déclenchée. */
  compensated: boolean;
  /** Message d'escalade en cas de pause (chaîne>DEEP). */
  pauseReason?: string;
}
