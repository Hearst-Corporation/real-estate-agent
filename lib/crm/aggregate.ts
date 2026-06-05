/**
 * Helpers d'agrégation CRM — purs, server-safe, zéro dépendance React/Cockpit.
 * Transforment des lignes de données en structures consommées par les
 * composants viz (Funnel, BarList, Donut). Tolèrent toujours les jeux vides
 * (retour [] / 0, jamais NaN).
 */

import { eur } from "./format";
import type { StatusTone } from "./statusTone";

// ─── Types consommés par les composants viz ──────────────────────────────────

export type FunnelStep = { label: string; count: number; tone?: StatusTone };
export type BarItem = { label: string; value: string; percent: number };

type WithStatus = { status: string };

// ─── countByStatus → Funnel ───────────────────────────────────────────────────

/**
 * Compte les lignes par statut, dans l'ordre fourni.
 * @param rows           lignes avec un champ `status`
 * @param orderedStatuses ordre canonique des statuts (ex: LEAD_STATUSES)
 * @param labels         map statut → libellé FR
 * @param toneFn         optionnel : statut → tonalité (.crm-status)
 */
export function countByStatus<T extends WithStatus>(
  rows: T[],
  orderedStatuses: readonly string[],
  labels: Record<string, string>,
  toneFn?: (status: string) => StatusTone
): FunnelStep[] {
  return orderedStatuses.map((status) => ({
    label: labels[status] ?? status,
    count: rows.reduce((n, r) => (r.status === status ? n + 1 : n), 0),
    tone: toneFn ? toneFn(status) : undefined,
  }));
}

// ─── topByCategory → BarList ────────────────────────────────────────────────────

/**
 * Top N catégories d'un champ texte, triées par fréquence décroissante.
 * Les valeurs nulles/vides sont ignorées. percent = part relative au max.
 */
export function topByCategory<T>(
  rows: T[],
  field: keyof T,
  labels?: Record<string, string>,
  top = 5
): BarItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([key, n]) => ({
    label: labels?.[key] ?? key,
    value: String(n),
    percent: Math.round((n / max) * 100),
  }));
}

// ─── distributeByBand → BarList ─────────────────────────────────────────────────

export type Band = [min: number, max: number];

/** Tranches de montant par défaut (€). */
export const PRICE_BANDS: Band[] = [
  [0, 200_000],
  [200_000, 400_000],
  [400_000, 600_000],
  [600_000, 1_000_000],
  [1_000_000, Infinity],
];

/** Libellé FR d'une tranche, formaté via eur(). */
function bandLabel([min, max]: Band): string {
  if (max === Infinity) return `${eur(min)} +`;
  if (min === 0) return `< ${eur(max)}`;
  return `${eur(min)} – ${eur(max)}`;
}

/**
 * Distribue les lignes par tranche de valeur (champ numérique).
 * percent = part relative à la tranche la plus peuplée.
 */
export function distributeByBand<T>(
  rows: T[],
  valueField: keyof T,
  bands: Band[] = PRICE_BANDS
): BarItem[] {
  const counts = bands.map(([min, max]) =>
    rows.reduce((n, r) => {
      const v = r[valueField];
      return typeof v === "number" && v >= min && v < max ? n + 1 : n;
    }, 0)
  );
  const max = Math.max(...counts, 1);
  return bands.map((band, i) => ({
    label: bandLabel(band),
    value: String(counts[i]),
    percent: Math.round((counts[i] / max) * 100),
  }));
}

// ─── ratio → Donut ──────────────────────────────────────────────────────────────

/** Pourcentage (0-100, arrondi) de lignes satisfaisant le prédicat. 0 si vide. */
export function ratio<T>(rows: T[], predicate: (row: T) => boolean): number {
  if (rows.length === 0) return 0;
  const n = rows.reduce((acc, r) => (predicate(r) ? acc + 1 : acc), 0);
  return Math.round((n / rows.length) * 100);
}

/** Moyenne d'un champ numérique sur les lignes où il est défini. 0 si aucune. */
export function average<T>(rows: T[], field: keyof T): number {
  const vals = rows
    .map((r) => r[field])
    .filter((v) => typeof v === "number") as number[];
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
