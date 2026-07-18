/**
 * lib/learning/types.ts — types de l'apprentissage commercial EXPLICABLE.
 *
 * Doctrine (non négociable) : AUCUN modèle opaque, AUCUN score inventé. Tout ce
 * qui suit est DÉRIVÉ de feedbacks RÉELS (prosp_match_feedback, offmarket_feedback,
 * visit_reports) de façon déterministe et traçable. Feedback absent → statut
 * `insufficient_data` honnête, jamais une conclusion fabriquée.
 */

/** Les critères que le moteur `lib/prospection` sait scorer (clés de breakdown). */
export type Criterion =
  | "zone"
  | "budget"
  | "surface"
  | "pieces"
  | "typeBien"
  | "confort";

export const CRITERIA: readonly Criterion[] = [
  "zone",
  "budget",
  "surface",
  "pieces",
  "typeBien",
  "confort",
] as const;

/**
 * Sens d'un feedback pour l'apprentissage — dérivé sans ambiguïté des signaux
 * réels : prosp_match_feedback.signal (like|dislike|contact|visite),
 * offmarket_feedback.verdict (interesse|pas_interesse|a_revoir),
 * visit_reports.interest/outcome.
 *   positive  : le prospect a validé le bien (like/contact/visite/interesse/offre)
 *   negative  : le prospect a écarté le bien (dislike/pas_interesse/abandon)
 *   neutral   : à revoir / mitigé — compté mais sans force de classement
 */
export type Polarity = "positive" | "negative" | "neutral";

/**
 * Un évènement de feedback NORMALISÉ, prêt pour l'agrégation. `criteriaMet`
 * indique, critère par critère, s'il était satisfait DANS CE MATCH précis (dérivé
 * du breakdown/features réels persistés). `null` = donnée absente (non évaluable).
 */
export interface FeedbackEvent {
  /** Source réelle du signal (traçabilité). */
  source: "prosp_match" | "offmarket" | "visit";
  polarity: Polarity;
  /** Par critère : true = satisfait dans ce match, false = non satisfait, null = inconnu. */
  criteriaMet: Partial<Record<Criterion, boolean | null>>;
  /** Horodatage ISO du feedback (traçabilité, non utilisé dans le score). */
  at?: string;
}

/** Classement appris d'un critère pour un prospect. */
export type CriterionStatus =
  /** Confirmé important : satisfait quand le prospect valide. */
  | "satisfait"
  /** Toléré : le prospect valide MÊME quand ce critère n'est pas satisfait. */
  | "tolere"
  /** Bloquant : le prospect refuse systématiquement quand ce critère manque. */
  | "bloquant"
  /** Pas assez de feedback pour trancher — honnête. */
  | "insufficient_data";

/** Comptes bruts ayant produit le classement d'un critère (traçabilité totale). */
export interface CriterionEvidence {
  /** Feedbacks positifs où le critère ÉTAIT satisfait. */
  positiveMet: number;
  /** Feedbacks positifs où le critère N'ÉTAIT PAS satisfait (→ tolérance). */
  positiveUnmet: number;
  /** Feedbacks négatifs où le critère N'ÉTAIT PAS satisfait (→ blocage). */
  negativeUnmet: number;
  /** Feedbacks négatifs où le critère ÉTAIT satisfait (bruit, non bloquant). */
  negativeMet: number;
  /** Total d'évènements où le critère était évaluable (met !== null). */
  evaluated: number;
}

export interface CriterionSignal {
  criterion: Criterion;
  status: CriterionStatus;
  evidence: CriterionEvidence;
  /** Facteur de poids déterministe à appliquer (1 = neutre). Voir rank.ts. */
  weightFactor: number;
  /** Phrase lisible expliquant le classement (français, dérivée des comptes). */
  reason: string;
}

/** Profil d'apprentissage complet d'un prospect (critère). */
export interface LearningProfile {
  critereId: string;
  /** Nombre total de feedbacks exploités (toutes sources). */
  totalFeedback: number;
  /** true si aucun feedback exploitable → tout est `insufficient_data`. */
  insufficientData: boolean;
  signals: CriterionSignal[];
}
