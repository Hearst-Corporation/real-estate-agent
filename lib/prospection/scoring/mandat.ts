import type { Annonce, MandatConfig, MandatWeights } from "../types";
import { PRESETS } from "../types";

const KNOWN_KEYS: (keyof MandatWeights)[] = [
  "pap", "zone_prioritaire", "republication_recente", "description_pap", "anciennete_45j", "baisse_prix",
];

export interface MandatScore {
  score: number;       // 0-100 renormalisé
  eligible: boolean;
  breakdown: Record<string, number>;
}

export function scoreMandat(annonce: Annonce, config: MandatConfig, ageJours?: number): MandatScore {
  const weights = resolveWeights(config);
  const sumPoids = KNOWN_KEYS.reduce((s, k) => s + (weights[k] ?? 0), 0);

  const contrib: Record<string, number> = {};
  let raw = 0;

  // pap
  const wPap = weights.pap ?? 0;
  if (wPap > 0) {
    const sat = annonce.isPap;
    contrib.pap = sat ? wPap : 0;
    raw += contrib.pap;
  }

  // zone_prioritaire
  const wZone = weights.zone_prioritaire ?? 0;
  if (wZone > 0) {
    const cp = annonce.codePostal ?? "";
    const zones = config.zonesEligibles ?? [];
    const sat = zones.length === 0 || zones.some(z => cp.startsWith(z));
    contrib.zone_prioritaire = sat ? wZone : 0;
    raw += contrib.zone_prioritaire;
  }

  // republication_recente
  const wRepub = weights.republication_recente ?? 0;
  if (wRepub > 0) {
    const sat = Boolean(annonce.republication);
    contrib.republication_recente = sat ? wRepub : 0;
    raw += contrib.republication_recente;
  }

  // description_pap (heuristique : description contient "particulier", "proprio", "PAP")
  const wDesc = weights.description_pap ?? 0;
  if (wDesc > 0) {
    const desc = (annonce.description ?? "").toLowerCase();
    const sat = /particulier|proprio|pap/.test(desc) || annonce.isPap;
    contrib.description_pap = sat ? wDesc : 0;
    raw += contrib.description_pap;
  }

  // anciennete_45j
  const wAnc = weights.anciennete_45j ?? 0;
  if (wAnc > 0) {
    const age = ageJours ?? calcAge(annonce.datePublication);
    const sat = age >= 45;
    contrib.anciennete_45j = sat ? wAnc : 0;
    raw += contrib.anciennete_45j;
  }

  // baisse_prix
  const wBaisse = weights.baisse_prix ?? 0;
  if (wBaisse > 0) {
    const sat = annonce.prixPrecedent != null && annonce.prix != null && annonce.prix < annonce.prixPrecedent;
    contrib.baisse_prix = sat ? wBaisse : 0;
    raw += contrib.baisse_prix;
  }

  const score = sumPoids > 0 ? Math.min(100, Math.round((raw / sumPoids) * 100)) : 0;
  return { score, eligible: score >= config.seuil, breakdown: contrib };
}

function resolveWeights(config: MandatConfig): MandatWeights {
  if (config.preset === "custom") {
    // Filtrer les clés hors-ensemble
    const filtered: MandatWeights = {};
    for (const k of KNOWN_KEYS) {
      if (config.weights[k] != null) filtered[k] = config.weights[k];
    }
    return filtered;
  }
  return PRESETS[config.preset] ?? PRESETS.api;
}

function calcAge(dateStr?: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
