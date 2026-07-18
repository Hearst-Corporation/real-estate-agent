/**
 * lib/offmarket/matching.ts — Matching OFF-MARKET portefeuille ↔ acquéreurs.
 *
 * « Off-market » = matcher un bien du PORTEFEUILLE (`properties`, pas les
 * annonces publiques scrapées) contre les critères acquéreurs
 * (`prosp_criteres_acquereur`).
 *
 * ⚠️ AUCUN score parallèle inventé : on RÉUTILISE le moteur de matching existant
 * de la prospection (`lib/prospection/matching/match.ts` → `matchAnnonce`), avec
 * ses poids (`weights.ts`), ses filtres durs et sa dérivation de recommandation.
 * On se contente d'ADAPTER un `properties.Row` à la forme `Annonce` attendue par
 * le moteur, puis on délègue. Le mapper critère est aussi celui de la
 * prospection (`dbRowToCritere`).
 */

import type { Database } from "@/lib/gpu1/database.types";
import type { Annonce, CritereAcquereur } from "@/lib/prospection/types";
import { dbRowToCritere } from "@/lib/prospection/mappers";
import { matchAnnonce, type ScoredMatch } from "@/lib/prospection/matching/match";

export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

/** Un acquéreur matché avec le score RÉEL calculé par le moteur prospection. */
export interface OffmarketMatch {
  critereId: string;
  critereNom: string;
  leadId: string | null;
  score: number;
  recommandation: ScoredMatch["recommandation"];
  breakdown: Record<string, number>;
  satisfaits: string[];
  nonSatisfaits: string[];
}

/**
 * Adapte un bien du portefeuille (`properties.Row`) à la forme `Annonce` du
 * moteur de matching. Ne fabrique aucune valeur : les champs absents restent
 * `undefined` (le moteur applique alors ses demi-scores / pénalités données
 * manquantes existants). `source` est marqué `portfolio` pour tracer l'origine.
 */
export function propertyToAnnonce(p: PropertyRow): Annonce {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    source: "portfolio",
    sourceId: p.id,
    hashDedup: p.id,
    typeBien: p.property_type ?? "",
    titre: p.title ?? undefined,
    description: p.notes ?? undefined,
    prix: p.asking_price ?? undefined,
    surface: p.surface ?? undefined,
    pieces: p.rooms ?? undefined,
    chambres: p.bedrooms ?? undefined,
    codePostal: p.postal_code ?? undefined,
    ville: p.city ?? undefined,
    ascenseur: p.has_elevator,
    terrasse: p.has_terrace,
    parking: p.has_parking,
    jardin: p.has_garden,
    piscine: p.has_pool,
    dpe: p.dpe_letter ?? undefined,
    isPap: false,
  };
}

/**
 * Pour un bien du portefeuille + la liste des critères acquéreurs du tenant,
 * renvoie les acquéreurs qui matchent, triés par score décroissant.
 *
 * Le score et la recommandation viennent INTÉGRALEMENT de `matchAnnonce`
 * (moteur prospection). Un critère qui échoue à un filtre dur (`matchAnnonce`
 * renvoie null) est simplement écarté — jamais présenté avec un score fabriqué.
 *
 * @param critereRows  lignes brutes `prosp_criteres_acquereur` (actives)
 */
export function matchPropertyToAcquereurs(
  property: PropertyRow,
  critereRows: Array<Record<string, unknown>>,
): OffmarketMatch[] {
  const annonce = propertyToAnnonce(property);
  const out: OffmarketMatch[] = [];

  for (const row of critereRows) {
    const critere: CritereAcquereur = dbRowToCritere(row);
    const scored = matchAnnonce(critere, annonce);
    if (!scored) continue; // filtre dur → pas un match, on n'invente rien
    out.push({
      critereId: critere.id,
      critereNom: critere.nom,
      leadId: critere.leadId ?? null,
      score: scored.score,
      recommandation: scored.recommandation,
      breakdown: scored.breakdown,
      satisfaits: scored.explain.satisfaits,
      nonSatisfaits: scored.explain.nonSatisfaits,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
