/**
 * lib/stats.ts — Statistiques descriptives pures, sans dépendance ni I/O.
 *
 * Implémentation CANONIQUE : `median` était dupliqué à l'identique dans
 * `lib/estimation/comparables.ts`, `lib/estimation/valuation.ts` et
 * `lib/conversion/pipeline.ts` — trois copies à maintenir en parallèle pour
 * un calcul qui doit rester strictement identique entre l'estimation et le
 * rapport de conversion.
 */

/**
 * Médiane d'une liste de nombres. `null` si la liste est vide.
 * N'altère pas le tableau reçu (tri sur une copie).
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
