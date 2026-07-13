// Poids du moteur de matching acquéreur (0-100 final)
export const MATCH_WEIGHTS = {
  zone: 40,        // code postal dans la liste demandée
  budget: 20,      // prix dans la fourchette
  surface: 15,     // surface dans la fourchette
  pieces: 10,      // pièces dans la fourchette
  typeBien: 10,    // type de bien match
  confort: 5,      // bonus confort souples (cap +10 pts via extra)
} as const;

export const DPE_ORDER = ["A","B","C","D","E","F","G"] as const;

/**
 * Version du moteur de matching — persistée dans `prosp_matchs.engine_version`
 * (migration 0040). Bump à chaque changement observable de score / recommandation
 * pour tracer avec quel algo une ligne a été produite (audit + re-scoring ciblé).
 *   patch : correction sans changement de barème ni de seuils
 *   minor : nouveau facteur / seuil (rétro-compatible)
 *   major : refonte du barème (scores non comparables aux versions précédentes)
 */
export const MATCH_ENGINE_VERSION = "match@1.1.0";

/**
 * Seuils de recommandation dérivés du score pondéré (0-100). Source unique —
 * l'UI et le job d'alerte doivent lire ces bornes, jamais les ré-écrire en dur.
 *   score >= HIGH  → 'high_priority'
 *   score >= REVIEW→ 'review'
 *   sinon          → 'low_priority'
 *   must-have KO   → 'rejected' (matchAnnonce retourne null)
 */
export const RECOMMENDATION_THRESHOLDS = {
  high: 75,
  review: 50,
} as const;

/**
 * Plafond de score quand une donnée essentielle (prix, surface, pièces) manque.
 * Empêche qu'une annonce lacunaire atteigne 'high_priority' sur le seul poids de
 * zone (40) + typeBien (10) + demi-scores. Une annonce sans prix ne doit jamais
 * être poussée en priorité haute sans qu'un humain l'ait revue.
 */
export const MISSING_ESSENTIAL_SCORE_CAP = 60;

/** Champs d'annonce considérés essentiels pour la fiabilité du score. */
export const ESSENTIAL_FIELDS = ["prix", "surface", "pieces"] as const;
