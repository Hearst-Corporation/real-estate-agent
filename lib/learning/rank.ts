/**
 * lib/learning/rank.ts — RE-CLASSEMENT déterministe des matchs PAR-DESSUS le
 * moteur `lib/prospection`, guidé par le profil appris. NE MODIFIE PAS le moteur :
 * il lit le `score_breakdown` déjà produit et applique des facteurs de poids
 * BORNÉS et EXPLICABLES, critère par critère.
 *
 * Traçabilité : chaque match ajusté porte le détail avant/après et une liste de
 * raisons lisibles ("Pourquoi il a changé"). Aucun feedback → facteurs neutres →
 * score inchangé (identité), et l'explication le dit honnêtement.
 */

import { MATCH_WEIGHTS } from "@/lib/prospection/matching/weights";
import type { Criterion, CriterionSignal, LearningProfile } from "./types";

/** Un match tel que persisté (breakdown = points par critère). */
export interface RankableMatch {
  matchId: string;
  baseScore: number;
  breakdown: Record<string, number>;
}

export interface AdjustedFactor {
  criterion: Criterion;
  basePoints: number;
  adjustedPoints: number;
  weightFactor: number;
  status: CriterionSignal["status"];
}

export interface AdjustedMatch {
  matchId: string;
  baseScore: number;
  adjustedScore: number;
  delta: number;
  factors: AdjustedFactor[];
  /** Phrases lisibles : "Pourquoi il a changé". Vide si aucun ajustement. */
  changeReasons: string[];
}

/** Somme des poids max du moteur — sert à re-normaliser sur 0-100 après ajustement. */
const BASE_TOTAL_WEIGHT =
  MATCH_WEIGHTS.zone +
  MATCH_WEIGHTS.budget +
  MATCH_WEIGHTS.surface +
  MATCH_WEIGHTS.pieces +
  MATCH_WEIGHTS.typeBien +
  MATCH_WEIGHTS.confort;

function factorMap(profile: LearningProfile): Map<Criterion, CriterionSignal> {
  return new Map(profile.signals.map((s) => [s.criterion, s]));
}

const CRITERION_LABEL: Record<Criterion, string> = {
  zone: "zone",
  budget: "budget",
  surface: "surface",
  pieces: "pièces",
  typeBien: "type de bien",
  confort: "confort",
};

/** Clés de breakdown reconnues comme un critère apprenable (le reste = ignoré). */
const KNOWN_CRITERIA = new Set<string>([
  "zone",
  "budget",
  "surface",
  "pieces",
  "typeBien",
  "confort",
]);

/**
 * Applique le profil appris à UN match. Déterministe :
 *   - chaque critère présent dans le breakdown est multiplié par son weightFactor,
 *   - le total ajusté est re-normalisé sur la même base de poids que le moteur,
 *   - les clés hors critères (pénalités, etc.) sont conservées telles quelles.
 * Sans profil exploitable → identité (score inchangé, raisons vides).
 */
export function adjustMatch(match: RankableMatch, profile: LearningProfile): AdjustedMatch {
  const map = factorMap(profile);
  const factors: AdjustedFactor[] = [];
  const changeReasons: string[] = [];

  let adjustedCriteriaSum = 0;
  let extraSum = 0; // clés non-critères (pénalités, bonus divers) — inchangées

  for (const [key, rawPts] of Object.entries(match.breakdown)) {
    const pts = typeof rawPts === "number" && Number.isFinite(rawPts) ? rawPts : 0;
    if (!KNOWN_CRITERIA.has(key)) {
      extraSum += pts;
      continue;
    }
    const criterion = key as Criterion;
    const signal = map.get(criterion);
    const factor = profile.insufficientData || !signal ? 1 : signal.weightFactor;
    const adjustedPts = pts * factor;

    adjustedCriteriaSum += adjustedPts;

    factors.push({
      criterion,
      basePoints: pts,
      adjustedPoints: Math.round(adjustedPts * 100) / 100,
      weightFactor: factor,
      status: signal?.status ?? "insufficient_data",
    });

    if (factor !== 1 && pts > 0) {
      const label = CRITERION_LABEL[criterion];
      if (factor > 1) {
        changeReasons.push(`${label} renforcé (critère ${signal?.status}) : +${Math.round((factor - 1) * 100)}% de poids.`);
      } else {
        changeReasons.push(`${label} assoupli (critère toléré) : −${Math.round((1 - factor) * 100)}% de poids.`);
      }
    }
  }

  // Le score ajusté reste dans l'échelle 0-100 : les facteurs sont bornés et la
  // somme des poids critères ne dépasse pas BASE_TOTAL_WEIGHT (référence moteur)
  // une fois plafonnée à 100.
  const rawAdjusted = Math.min(adjustedCriteriaSum + extraSum, BASE_TOTAL_WEIGHT + extraSum);
  const adjustedScore = Math.max(0, Math.min(100, Math.round(rawAdjusted)));

  // Sécurité : sans ajustement réel, score = base (identité stricte, pas de dérive
  // d'arrondi).
  const noChange = profile.insufficientData || changeReasons.length === 0;
  const finalScore = noChange ? match.baseScore : adjustedScore;
  const delta = finalScore - match.baseScore;

  return {
    matchId: match.matchId,
    baseScore: match.baseScore,
    adjustedScore: finalScore,
    delta,
    factors,
    changeReasons: noChange ? [] : changeReasons,
  };
}

/**
 * Re-classe une liste de matchs selon le profil appris. Tri stable et déterministe :
 * score ajusté décroissant, puis score de base décroissant, puis matchId (tie-break
 * total → jamais d'ordre aléatoire).
 */
export function rankMatches(matches: RankableMatch[], profile: LearningProfile): AdjustedMatch[] {
  return matches
    .map((m) => adjustMatch(m, profile))
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
      return a.matchId.localeCompare(b.matchId);
    });
}
