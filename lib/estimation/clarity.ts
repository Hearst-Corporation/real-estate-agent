/**
 * lib/estimation/clarity.ts — lecture combinée de la composition de la valeur.
 *
 * Distingue, à partir de l'état RÉEL de l'estimation, quatre natures d'information
 * pour que l'agent comprenne immédiatement d'où vient la valeur et quoi faire :
 *   - CALCULÉ    : ajustements du moteur (valuation.adjustments) — dérivés des comps.
 *   - SAISI      : ajustements manuels tracés (colonne 0043 manual_adjustments).
 *   - MANQUANT   : champs matériels non renseignés → fourchette élargie.
 *   - À VÉRIFIER : champs déclarés mais marqués « à confirmer » (fieldStatus).
 *
 * Purement déterministe, aucun IO, ne touche pas au moteur de valorisation.
 */

import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

/**
 * Champs qui pèsent matériellement sur la valeur — si absents, la fourchette
 * s'élargit et l'avis reste fragile. Libellés courts pour l'affichage.
 */
export const MATERIAL_FIELDS: { field: keyof PropertyData; label: string }[] = [
  { field: "surface_habitable_m2", label: "Surface habitable" },
  { field: "type_bien", label: "Type de bien" },
  { field: "etat_general", label: "État général" },
  { field: "dpe_classe", label: "Classe DPE" },
  { field: "exposition", label: "Exposition" },
  { field: "etage", label: "Étage" },
  { field: "stationnement", label: "Stationnement" },
  { field: "charges_annuelles_eur", label: "Charges annuelles" },
];

/** Vrai si la valeur est « vide » (chaîne blanche ou tableau vide). null/undef traités par l'appelant. */
function isBlank(v: PropertyData[keyof PropertyData]): boolean {
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export type ClarityField = { field: string; label: string };

export type ValueClarity = {
  /** Champs matériels non renseignés. */
  missing: ClarityField[];
  /** Champs déclarés mais à confirmer (fieldStatus === "to_confirm"). */
  toVerify: ClarityField[];
};

/**
 * Classe les champs matériels en « manquant » vs « à vérifier ».
 * (Le CALCULÉ vient de valuation.adjustments et le SAISI de manual_adjustments,
 * gérés directement par l'UI — ici on ne dérive que ce qui manque/à confirmer.)
 */
export function computeValueClarity(
  property: PropertyData,
  fieldStatus: FieldStatusMap
): ValueClarity {
  const missing: ClarityField[] = [];
  const toVerify: ClarityField[] = [];

  for (const { field, label } of MATERIAL_FIELDS) {
    const value = property[field];
    const status = fieldStatus[field];
    const empty = value === null || value === undefined || isBlank(value);

    if (empty) {
      missing.push({ field: String(field), label });
    } else if (status === "to_confirm") {
      toVerify.push({ field: String(field), label });
    }
  }

  return { missing, toVerify };
}
