/**
 * config/assistant-ops.ts — constantes de l'assistant opérationnel (W9).
 *
 * Zéro magic number dans le code : chaque seuil/borne vient d'ici (lu de l'env
 * avec un défaut borné). Ces valeurs pilotent la PRIORISATION déterministe des
 * propositions — jamais un chiffre inventé, tout est explicable.
 */

/** Lit un entier d'env avec défaut borné (jamais NaN, jamais négatif). */
function intEnv(name: string, def: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/** Nombre max de propositions renvoyées (borne dure de lecture). */
export const ASSISTANT_PROPOSAL_LIMIT = intEnv("ASSISTANT_PROPOSAL_LIMIT", 12);

/** Nombre de cartes scorées reprises du centre d'actions comme propositions. */
export const ASSISTANT_ACTION_TAKE = intEnv("ASSISTANT_ACTION_TAKE", 8);

/** Nombre de prospects dormants transformés en propositions de relance. */
export const ASSISTANT_REACTIVATION_TAKE = intEnv("ASSISTANT_REACTIVATION_TAKE", 4);

/**
 * Part de perte (0..100 %) à un étage du funnel au-delà de laquelle on propose
 * une action corrective. En dessous, la fuite n'est pas assez concentrée.
 */
export const ASSISTANT_FUNNEL_LEAK_MIN_PCT = intEnv("ASSISTANT_FUNNEL_LEAK_MIN_PCT", 25);

/** Priorité de base d'une proposition de fuite de funnel (borné [0..100]). */
export const ASSISTANT_FUNNEL_BASE_PRIORITY = intEnv("ASSISTANT_FUNNEL_BASE_PRIORITY", 55);

/** Priorité de base d'une proposition de réactivation (borné [0..100]). */
export const ASSISTANT_REACTIVATION_BASE_PRIORITY = intEnv(
  "ASSISTANT_REACTIVATION_BASE_PRIORITY",
  45,
);

/** Ancienneté (jours) au-delà de laquelle un dormant sature son bonus de priorité. */
export const ASSISTANT_DORMANT_SATURATION_DAYS = intEnv(
  "ASSISTANT_DORMANT_SATURATION_DAYS",
  120,
);
