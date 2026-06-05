/**
 * Indexation temporelle des comps DVF vers aujourd'hui.
 *
 * DVF a typiquement 6–12 mois de retard de publication, et les mutations
 * portent sur des transactions passées. Sans correction, on sous-estime
 * systématiquement dans un marché haussier.
 *
 * Approximation nationale — indice "prix logements anciens" base 100 au T1 2020.
 * À remplacer par un flux INSEE/Notaires par département (série DS_ILC_A21_A).
 * Source proxy : évolution observée +~3 %/an 2020-2022, +7 % 2022-2023 (pic),
 * +1 % 2023-2024 (plateau), stable 2024-2026.
 */

import type { DvfComparable } from './types';

// ─── Série trimestrielle nationale base 100 = T1 2020 ────────────────────────

export const NATIONAL_INDEX: { quarter: string; value: number }[] = [
  { quarter: '2020-Q1', value: 100.0 },
  { quarter: '2020-Q2', value: 100.4 },
  { quarter: '2020-Q3', value: 101.5 },
  { quarter: '2020-Q4', value: 103.2 },
  { quarter: '2021-Q1', value: 104.8 },
  { quarter: '2021-Q2', value: 106.5 },
  { quarter: '2021-Q3', value: 108.3 },
  { quarter: '2021-Q4', value: 110.0 },
  { quarter: '2022-Q1', value: 112.1 },
  { quarter: '2022-Q2', value: 114.5 },
  { quarter: '2022-Q3', value: 116.2 },
  { quarter: '2022-Q4', value: 117.0 },
  { quarter: '2023-Q1', value: 117.8 },
  { quarter: '2023-Q2', value: 118.9 },
  { quarter: '2023-Q3', value: 119.2 },
  { quarter: '2023-Q4', value: 119.0 },
  { quarter: '2024-Q1', value: 118.7 },
  { quarter: '2024-Q2', value: 119.1 },
  { quarter: '2024-Q3', value: 119.5 },
  { quarter: '2024-Q4', value: 120.0 },
  { quarter: '2025-Q1', value: 120.4 },
  { quarter: '2025-Q2', value: 120.9 },
  { quarter: '2025-Q3', value: 121.3 },
  { quarter: '2025-Q4', value: 121.8 },
  { quarter: '2026-Q1', value: 122.2 },
  { quarter: '2026-Q2', value: 122.6 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToQuarter(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth(); // 0-based
    const q = Math.floor(month / 3) + 1;
    return `${year}-Q${q}`;
  } catch {
    return '';
  }
}

function lookupIndex(quarter: string): number | null {
  if (!quarter) return null;
  const entry = NATIONAL_INDEX.find((e) => e.quarter === quarter);
  return entry ? entry.value : null;
}

/** Valeur de l'indice au trimestre le plus récent disponible (= "aujourd'hui"). */
function currentIndexValue(): number {
  return NATIONAL_INDEX[NATIONAL_INDEX.length - 1].value;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Facteur d'indexation pour ramener un prix DVF daté à aujourd'hui.
 * Retourne `valeur_aujourd'hui / valeur_au_trimestre_de_vente`.
 * Clampé entre 0.85 et 1.20 pour éviter les aberrations sur données anciennes.
 */
export function indexFactor(saleDateISO: string): number {
  const quarter = isoToQuarter(saleDateISO);
  const saleValue = lookupIndex(quarter);

  // Trimestre hors série → utiliser la valeur du début de série (2020-Q1)
  // ou de fin de série selon ancienneté ; on opte pour aucune correction (1.0)
  // plutôt que d'inventer un chiffre.
  if (saleValue === null) return 1.0;

  const factor = currentIndexValue() / saleValue;
  // Clamp 0.85 – 1.20
  return Math.min(1.2, Math.max(0.85, factor));
}

/**
 * Retourne une copie du DvfComparable avec `prix_m2` indexé vers aujourd'hui.
 */
export function indexComparable(c: DvfComparable): DvfComparable {
  const factor = indexFactor(c.date_mutation);
  return {
    ...c,
    prix_m2: Math.round(c.prix_m2 * factor),
  };
}
