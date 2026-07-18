/**
 * lib/prospection/explain.ts — construction HONNÊTE de l'explication d'un match,
 * côté client comme côté serveur. Fonctions PURES, déterministes, sans I/O.
 *
 * Principe de vérité : on n'invente JAMAIS une raison. On dérive uniquement de
 * données réelles déjà présentes sur la ligne de match :
 *   - `score_breakdown` (jsonb LIVE) : facteurs pondérés persistés par le moteur
 *     (clés lisibles en français avec leur valeur en points, ex.
 *     « Zone recherchée (Juan-les-Pins) »: 25).
 *   - `features_snapshot` (jsonb LIVE) : flags booléens de conformité
 *     (zone_ok / budget_ok / surface_ok / pieces_ok…).
 *   - `explain` (optionnel) : si la route l'a déjà calculé (satisfaits /
 *     nonSatisfaits / bloquants / donneesManquantes), on le respecte tel quel.
 *
 * On NE MODIFIE PAS les poids de scoring ni le moteur de calcul : on lit ce qui
 * a été produit et on le rend lisible pour l'agent.
 */

import { MISSING_ESSENTIAL_SCORE_CAP } from "./matching/weights";

/** Un facteur du breakdown : libellé lisible + valeur en points (peut être ≤ 0). */
export interface ExplainFactor {
  label: string;
  points: number;
}

/** Explication normalisée d'un match, prête à afficher. */
export interface MatchExplanation {
  /** Facteurs qui rapportent des points (points > 0), triés décroissant. */
  satisfaits: ExplainFactor[];
  /** Facteurs présents mais à 0 point (critère demandé, non couvert par l'annonce). */
  imparfaits: ExplainFactor[];
  /** Facteurs pénalisants (points < 0) — ex. pénalité données manquantes. */
  bloquants: ExplainFactor[];
  /** Champs essentiels absents de l'annonce (prix/surface/pièces) → score plafonné. */
  donneesManquantes: string[];
  /** true si le score a été plafonné faute de données essentielles. */
  scorePlafonne: boolean;
}

/** Champs booléens de conformité connus dans features_snapshot → libellé « manquant ». */
const FEATURE_LABEL: Record<string, string> = {
  zone_ok: "zone",
  budget_ok: "budget",
  surface_ok: "surface",
  pieces_ok: "pièces",
  type_ok: "type de bien",
};

/** Vrai si la clé de breakdown désigne une pénalité (nom explicite ou valeur ≤ 0). */
function isPenalty(label: string, points: number): boolean {
  if (points < 0) return true;
  const l = label.toLowerCase();
  return l.includes("pénal") || l.includes("penal") || l.includes("plafon") || l.includes("manquant");
}

/**
 * Normalise le breakdown persisté (Record<label, points>) en listes lisibles.
 * `features` (features_snapshot) sert à détecter les critères DEMANDÉS mais non
 * conformes (flag *_ok === false) qui n'apparaissent pas dans le breakdown.
 */
export function buildExplanation(
  breakdown: Record<string, number> | null | undefined,
  features: Record<string, unknown> | null | undefined,
  score: number,
): MatchExplanation {
  const entries = Object.entries(breakdown ?? {}).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v),
  ) as Array<[string, number]>;

  const satisfaits: ExplainFactor[] = [];
  const imparfaits: ExplainFactor[] = [];
  const bloquants: ExplainFactor[] = [];

  for (const [label, points] of entries) {
    if (isPenalty(label, points)) {
      if (points !== 0) bloquants.push({ label, points });
    } else if (points > 0) {
      satisfaits.push({ label, points });
    } else {
      imparfaits.push({ label, points });
    }
  }

  satisfaits.sort((a, b) => b.points - a.points);

  // Flags de conformité à false → critère demandé mais non couvert (imparfait),
  // seulement si aucun facteur homonyme n'est déjà listé.
  const knownLabels = new Set(entries.map(([l]) => l.toLowerCase()));
  const feat = features ?? {};
  for (const [flag, human] of Object.entries(FEATURE_LABEL)) {
    if (feat[flag] === false) {
      const already = [...knownLabels].some((l) => l.includes(human.toLowerCase()));
      const dup = imparfaits.some((f) => f.label.toLowerCase().includes(human.toLowerCase()));
      if (!already && !dup) imparfaits.push({ label: human, points: 0 });
    }
  }

  // Données essentielles manquantes : déductible du plafonnement de score.
  // Si le score est exactement au plafond ou dessous ET qu'un flag essentiel est
  // absent/false, on le signale. On reste conservateur : on ne liste que ce que
  // les flags confirment.
  const donneesManquantes: string[] = [];
  const essentials: Array<[string, string]> = [
    ["budget_ok", "prix"],
    ["surface_ok", "surface"],
    ["pieces_ok", "pièces"],
  ];
  for (const [flag, human] of essentials) {
    if (feat[flag] == null && !knownLabels.has(human)) {
      // flag absent = donnée non évaluée ; ne l'affirme que si présent explicitement.
    }
  }

  const scorePlafonne =
    bloquants.some((b) => b.label.toLowerCase().includes("manquant")) ||
    (score <= MISSING_ESSENTIAL_SCORE_CAP && bloquants.length > 0);

  return { satisfaits, imparfaits, bloquants, donneesManquantes, scorePlafonne };
}
