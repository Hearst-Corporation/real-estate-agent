/**
 * lib/value-evolution — VALEUR IMMOBILIÈRE ÉVOLUTIVE (W6).
 * Point d'entrée unique : types + détection pure + lecture DB owner-scopée.
 */

export * from "@/lib/value-evolution/types";
export {
  DEFAULT_THRESHOLDS,
  addressOf,
  buildSeries,
  computeVariation,
  formatDeltaEur,
  formatPct,
  normalizeAddress,
  relanceFromSeries,
  relanceOpportunities,
  valueOf,
  type Thresholds,
} from "@/lib/value-evolution/detect";
export { loadValueSeries, type ValueEvolutionDbLike } from "@/lib/value-evolution/db";
