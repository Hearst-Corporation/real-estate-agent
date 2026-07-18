/**
 * lib/post-visit — boucle intelligente après visite (W3).
 * Barrel des surfaces réutilisables (dérivation pure + orchestration DB).
 */
export * from "./types";
export { deriveSignals, deriveCriteriaSuggestions, deriveRelances } from "./derive";
export { recomputeMatchesForProperty, type RecomputeOutcome } from "./recompute";
export { persistSignals, createRelances, type CreatedRelances } from "./db";
