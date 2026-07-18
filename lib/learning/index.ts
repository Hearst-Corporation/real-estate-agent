// lib/learning/index.ts — surface publique de l'apprentissage commercial explicable.
export * from "./types";
export { deriveLearningProfile, deriveCriterionSignal, MIN_EVIDENCE } from "./signals";
export {
  adjustMatch,
  rankMatches,
  type RankableMatch,
  type AdjustedMatch,
  type AdjustedFactor,
} from "./rank";
export {
  collectFeedbackEvents,
  criteriaMetFromBreakdown,
  type CollectOptions,
} from "./aggregate";
