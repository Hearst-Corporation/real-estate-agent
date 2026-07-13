// Dérivation de la recommandation d'un match — RÉUTILISE les seuils partagés
// (RECOMMENDATION_THRESHOLDS) et la même logique que deriveRecommandation du
// moteur (lib/prospection/matching/match.ts). On préfère la recommandation
// renvoyée par l'API si elle existe ; sinon on la calcule du score, sans jamais
// inventer de valeur. Fonction pure, déterministe.

import { RECOMMENDATION_THRESHOLDS } from "@/lib/prospection/matching/weights";
import type { Match, Recommandation } from "./types";

export function recoFromScore(score: number): Recommandation {
  if (score >= RECOMMENDATION_THRESHOLDS.high) return "high_priority";
  if (score >= RECOMMENDATION_THRESHOLDS.review) return "review";
  return "low_priority";
}

/** Recommandation effective : API si fournie, sinon dérivée du score. */
export function matchReco(m: Match): Recommandation {
  return m.recommandation ?? recoFromScore(m.score_match);
}

/** Facteurs de score réels (score_breakdown), ordonnés par poids décroissant. */
export function scoreFactors(m: Match): Array<[string, number]> {
  const bd = m.score_breakdown ?? m.bonus_breakdown ?? {};
  return Object.entries(bd)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
}
