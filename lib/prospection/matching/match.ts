import type { Annonce, CritereAcquereur, MatchResult, PrefSouple } from "../types";
import { MATCH_WEIGHTS, DPE_ORDER } from "./weights";

export function matchAnnonce(critere: CritereAcquereur, annonce: Annonce): MatchResult | null {
  // ── Filtres durs ──
  if (critere.typeBien?.length && !critere.typeBien.includes(annonce.typeBien)) return null;
  if (!critere.zones.some(z => (annonce.codePostal ?? "").startsWith(z))) return null;
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
  let total = 0;

  // zone (déjà validée) → plein score
  breakdown.zone = MATCH_WEIGHTS.zone;
  total += MATCH_WEIGHTS.zone;

  // budget
  breakdown.budget = scoreBudget(critere, annonce);
  total += breakdown.budget;

  // surface
  breakdown.surface = scoreSurface(critere, annonce);
  total += breakdown.surface;

  // pièces
  breakdown.pieces = scorePieces(critere, annonce);
  total += breakdown.pieces;

  // type bien (déjà validé par filtre dur si liste non vide → plein score)
  breakdown.typeBien = MATCH_WEIGHTS.typeBien;
  total += breakdown.typeBien;

  // bonus confort (prefs 'indifferent' satisfaites)
  const confortBonus = scoreConfort(critere, annonce);
  breakdown.confort = confortBonus;
  total += confortBonus;

  const score = Math.min(100, Math.round(total));
  const features: Record<string, unknown> = {
    prix: annonce.prix,
    surface: annonce.surface,
    pieces: annonce.pieces,
    codePostal: annonce.codePostal,
    typeBien: annonce.typeBien,
    dpe: annonce.dpe,
    isPap: annonce.isPap,
  };

  return { critereId: critere.id, annonceId: annonce.id, score, breakdown, features };
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
