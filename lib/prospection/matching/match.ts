import type { Annonce, CritereAcquereur, MatchResult, PrefSouple } from "../types";
import {
  MATCH_WEIGHTS,
  DPE_ORDER,
  MATCH_ENGINE_VERSION,
  RECOMMENDATION_THRESHOLDS,
  MISSING_ESSENTIAL_SCORE_CAP,
  ESSENTIAL_FIELDS,
} from "./weights";

export type Recommandation = "high_priority" | "review" | "low_priority" | "rejected";

export type ValuationGapStatus =
  | "below_range"    // prix affiché < fourchette basse (potentielle bonne affaire)
  | "within_range"   // prix affiché dans la fourchette d'estimation
  | "above_range"    // prix affiché > fourchette haute (surcoté)
  | "low_confidence" // estimation dégradée / peu fiable → écart non exploitable
  | "unavailable";   // pas d'estimation fournie OU prix annonce manquant

/**
 * Estimation optionnelle fournie par l'appelant (découplée de lib/estimation
 * pour garder le moteur pur et sans dépendance). Champs alignés sur le retour de
 * `computeValuation` : marketValue = valeur centrale, low/high = fourchette.
 */
export interface EstimationInput {
  /** Valeur de marché centrale (€). */
  marketValue: number;
  /** Borne basse de la fourchette (€). */
  lowValue: number;
  /** Borne haute de la fourchette (€). */
  highValue: number;
  /** Fiabilité de l'estimation. 'degraded' / 'indicative' → écart non exploitable. */
  dataStatus?: "complete" | "partial" | "degraded";
  confidence?: "indicative" | "moyenne" | "elevee";
}

export interface ValuationComparison {
  status: ValuationGapStatus;
  /** (prix_affiché − valeur_centrale) / valeur_centrale, arrondi 4 déc. null si inexploitable. */
  gap: number | null;
  marketValue: number | null;
  lowValue: number | null;
  highValue: number | null;
}

/** Explicabilité UI : quels critères sont satisfaits, lesquels non, lesquels bloquent. */
export interface MatchExplain {
  satisfaits: string[];
  nonSatisfaits: string[];
  bloquants: string[];
  /** Champs essentiels absents de l'annonce (prix/surface/pièces). */
  donneesManquantes: string[];
  /** true si le score a été plafonné faute de données essentielles. */
  scorePlafonne: boolean;
}

/** Super-ensemble de MatchResult — rétro-compatible avec les appelants existants. */
export interface ScoredMatch extends MatchResult {
  engineVersion: string;
  recommandation: Recommandation;
  explain: MatchExplain;
  valuation: ValuationComparison;
}

/**
 * Une zone de critère (CP « 06600 » OU nom de commune « Antibes ») matche une
 * annonce si elle préfixe son code postal OU correspond à sa commune (insensible
 * à la casse). Indispensable car le scraper Apify cherche par VILLE et ne résout
 * pas toujours le code postal (codePostal vide) — sans ça, aucun match possible.
 */
export function zoneMatches(zone: string, annonce: Annonce): boolean {
  const z = zone.trim().toLowerCase();
  if (!z) return false;
  const cp = (annonce.codePostal ?? "").trim().toLowerCase();
  const commune = (annonce.ville ?? "").trim().toLowerCase();
  if (cp && cp.startsWith(z)) return true;
  if (commune && commune === z) return true;
  return false;
}

/**
 * Compare le prix affiché à une estimation optionnelle. Fonction pure.
 * Pas d'estimation OU prix annonce manquant → 'unavailable' (aucune pénalité).
 * Estimation dégradée / indicative → 'low_confidence' (écart non exploitable).
 */
export function computeValuationComparison(
  annonce: Annonce,
  estimation?: EstimationInput | null,
): ValuationComparison {
  if (!estimation || annonce.prix == null) {
    return {
      status: "unavailable",
      gap: null,
      marketValue: estimation?.marketValue ?? null,
      lowValue: estimation?.lowValue ?? null,
      highValue: estimation?.highValue ?? null,
    };
  }

  const { marketValue, lowValue, highValue } = estimation;
  const lowConfidence =
    estimation.dataStatus === "degraded" || estimation.confidence === "indicative";

  if (lowConfidence || marketValue <= 0) {
    return {
      status: "low_confidence",
      gap: null,
      marketValue,
      lowValue,
      highValue,
    };
  }

  const gap = Math.round(((annonce.prix - marketValue) / marketValue) * 10000) / 10000;
  const status: ValuationGapStatus =
    annonce.prix < lowValue ? "below_range" : annonce.prix > highValue ? "above_range" : "within_range";

  return { status, gap, marketValue, lowValue, highValue };
}

/** Dérive la recommandation du score + de la fiabilité des données. */
function deriveRecommandation(score: number): Recommandation {
  if (score >= RECOMMENDATION_THRESHOLDS.high) return "high_priority";
  if (score >= RECOMMENDATION_THRESHOLDS.review) return "review";
  return "low_priority";
}

export function matchAnnonce(
  critere: CritereAcquereur,
  annonce: Annonce,
  estimation?: EstimationInput | null,
): ScoredMatch | null {
  // ── Filtres durs (must-have) — un seul échec ⇒ 'rejected' (null) ──
  if (critere.typeBien?.length && !critere.typeBien.includes(annonce.typeBien)) return null;
  if (!critere.zones.some(z => zoneMatches(z, annonce))) return null;
  if (critere.budgetMax != null && annonce.prix != null && annonce.prix > critere.budgetMax) return null;
  if (critere.budgetMin != null && annonce.prix != null && annonce.prix < critere.budgetMin) return null;
  if (critere.surfaceMin != null && annonce.surface != null && annonce.surface < critere.surfaceMin) return null;
  if (critere.surfaceMax != null && annonce.surface != null && annonce.surface > critere.surfaceMax) return null;
  if (critere.piecesMin != null && annonce.pieces != null && annonce.pieces < critere.piecesMin) return null;

  // Filtres durs prefs souples
  if (critere.terrasse === "requis" && !annonce.terrasse) return null;
  if (critere.terrasse === "exclu"  && annonce.terrasse)  return null;
  if (critere.parking  === "requis" && !annonce.parking)  return null;
  if (critere.parking  === "exclu"  && annonce.parking)   return null;
  if (critere.ascenseur === "requis" && !annonce.ascenseur) return null;
  if (critere.ascenseur === "exclu"  && annonce.ascenseur)  return null;
  if (critere.jardin   === "requis" && !annonce.jardin)   return null;
  if (critere.jardin   === "exclu"  && annonce.jardin)    return null;
  if (critere.piscine  === "requis" && !annonce.piscine)  return null;
  if (critere.piscine  === "exclu"  && annonce.piscine)   return null;

  // DPE dur (dpeMax = max accepté, ex. 'D' → A,B,C,D OK)
  if (critere.dpeMax && annonce.dpe) {
    const idx = DPE_ORDER.indexOf(annonce.dpe.toUpperCase() as typeof DPE_ORDER[number]);
    const maxIdx = DPE_ORDER.indexOf(critere.dpeMax.toUpperCase() as typeof DPE_ORDER[number]);
    if (idx > maxIdx) return null;
  }

  // ── Score pondéré ──
  const breakdown: Record<string, number> = {};
  const satisfaits: string[] = [];
  const nonSatisfaits: string[] = [];
  let total = 0;

  // zone (déjà validée) → plein score
  breakdown.zone = MATCH_WEIGHTS.zone;
  total += MATCH_WEIGHTS.zone;
  satisfaits.push("zone");

  // budget
  breakdown.budget = scoreBudget(critere, annonce);
  total += breakdown.budget;
  (breakdown.budget >= MATCH_WEIGHTS.budget ? satisfaits : nonSatisfaits).push("budget");

  // surface
  breakdown.surface = scoreSurface(critere, annonce);
  total += breakdown.surface;
  (breakdown.surface >= MATCH_WEIGHTS.surface ? satisfaits : nonSatisfaits).push("surface");

  // pièces
  breakdown.pieces = scorePieces(critere, annonce);
  total += breakdown.pieces;
  (breakdown.pieces >= MATCH_WEIGHTS.pieces ? satisfaits : nonSatisfaits).push("pieces");

  // type bien (déjà validé par filtre dur si liste non vide → plein score)
  breakdown.typeBien = MATCH_WEIGHTS.typeBien;
  total += breakdown.typeBien;
  satisfaits.push("typeBien");

  // bonus confort (prefs 'indifferent' satisfaites)
  const confortBonus = scoreConfort(critere, annonce);
  breakdown.confort = confortBonus;
  total += confortBonus;
  if (confortBonus > 0) satisfaits.push("confort");

  // ── Pénalité données manquantes ──
  // Un demi-score par champ absent ne suffit pas : une annonce sans prix cumule
  // toujours zone (40) + typeBien (10) + demi-surface + demi-pièces, ce qui peut
  // franchir le seuil 'high'. On plafonne donc le score total tant qu'un champ
  // essentiel (prix/surface/pièces) manque → jamais 'high_priority' à l'aveugle.
  const donneesManquantes = ESSENTIAL_FIELDS.filter(f => annonce[f] == null);
  const rawScore = Math.min(100, Math.round(total));
  const scorePlafonne = donneesManquantes.length > 0;
  const score = scorePlafonne ? Math.min(rawScore, MISSING_ESSENTIAL_SCORE_CAP) : rawScore;
  if (scorePlafonne) breakdown.penaliteDonneesManquantes = score - rawScore; // ≤ 0

  const features: Record<string, unknown> = {
    prix: annonce.prix,
    surface: annonce.surface,
    pieces: annonce.pieces,
    codePostal: annonce.codePostal,
    typeBien: annonce.typeBien,
    dpe: annonce.dpe,
    isPap: annonce.isPap,
  };

  const valuation = computeValuationComparison(annonce, estimation);

  const explain: MatchExplain = {
    satisfaits,
    nonSatisfaits,
    // Aucun must-have ne bloque ici (sinon on aurait retourné null). Les critères
    // souples non atteints sont exposés pour l'UI, mais ne sont pas « bloquants ».
    bloquants: [],
    donneesManquantes,
    scorePlafonne,
  };

  return {
    critereId: critere.id,
    annonceId: annonce.id,
    score,
    breakdown,
    features,
    engineVersion: MATCH_ENGINE_VERSION,
    recommandation: deriveRecommandation(score),
    explain,
    valuation,
  };
}

function scoreBudget(c: CritereAcquereur, a: Annonce): number {
  if (a.prix == null) return MATCH_WEIGHTS.budget * 0.5;
  const inRange = (c.budgetMin == null || a.prix >= c.budgetMin) && (c.budgetMax == null || a.prix <= c.budgetMax);
  return inRange ? MATCH_WEIGHTS.budget : 0;
}

function scoreSurface(c: CritereAcquereur, a: Annonce): number {
  if (a.surface == null) return MATCH_WEIGHTS.surface * 0.5;
  const ok = (c.surfaceMin == null || a.surface >= c.surfaceMin) && (c.surfaceMax == null || a.surface <= c.surfaceMax);
  return ok ? MATCH_WEIGHTS.surface : 0;
}

function scorePieces(c: CritereAcquereur, a: Annonce): number {
  if (a.pieces == null) return MATCH_WEIGHTS.pieces * 0.5;
  const ok = (c.piecesMin == null || a.pieces >= c.piecesMin) && (c.piecesMax == null || a.pieces <= c.piecesMax);
  return ok ? MATCH_WEIGHTS.pieces : 0;
}

function scoreConfort(c: CritereAcquereur, a: Annonce): number {
  const prefs: Array<[PrefSouple, boolean | undefined]> = [
    [c.terrasse,  a.terrasse],
    [c.parking,   a.parking],
    [c.ascenseur, a.ascenseur],
    [c.jardin,    a.jardin],
    [c.piscine,   a.piscine],
  ];
  let bonus = 0;
  for (const [pref, val] of prefs) {
    if (pref === "indifferent" && val === true) bonus += 2;
  }
  return Math.min(bonus, 10);
}
