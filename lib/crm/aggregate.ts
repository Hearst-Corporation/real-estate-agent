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

/** Libellé du regroupement des catégories hors top N. */
const OTHER_LABEL = "autres";

/**
 * Top N catégories d'un champ texte, triées par fréquence décroissante.
 * Les valeurs nulles/vides sont ignorées. `percent` = PART DU TOTAL (la somme
 * des barres ≈ 100 %), pas part du max → c'est une vraie répartition. Les
 * catégories au-delà du top N sont regroupées en un item « +N autres » (jamais
 * masquées silencieusement).
 */
export function topByCategory<T>(
  rows: T[],
  field: keyof T,
  labels?: Record<string, string>,
  top = 5
): BarItem[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const raw = row[field];
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, top);
  const items: BarItem[] = head.map(([key, n]) => ({
    label: labels?.[key] ?? key,
    value: String(n),
    percent: Math.round((n / total) * 100),
  }));

  const rest = sorted.slice(top);
  const restCount = rest.reduce((s, [, n]) => s + n, 0);
  if (restCount > 0) {
    items.push({
      label: `+${rest.length} ${OTHER_LABEL}`,
      value: String(restCount),
      percent: Math.round((restCount / total) * 100),
    });
  }
  return items;
}

// ─── distributeByBand → BarList ─────────────────────────────────────────────────

export type Band = [min: number, max: number];

/** Tranches de montant par défaut (€) — fallback si pas assez de données. */
export const PRICE_BANDS: Band[] = [
  [0, 200_000],
  [200_000, 400_000],
  [400_000, 600_000],
  [600_000, 1_000_000],
  [1_000_000, Infinity],
];

/**
 * Construit `n` tranches « jolies » couvrant la plage réelle des valeurs
 * (min → max), au lieu de bornes figées inadaptées au marché. La dernière
 * tranche est ouverte (→ Infinity). Fallback sur PRICE_BANDS si < 2 valeurs
 * exploitables ou plage nulle.
 */
export function autoBands(values: (number | null | undefined)[], n = 5): Band[] {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (nums.length < 2) return PRICE_BANDS;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return PRICE_BANDS;

  const rawStep = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.ceil(rawStep / mag) * mag;
  const start = Math.floor(min / niceStep) * niceStep;

  const bands: Band[] = [];
  let lo = start;
  for (let i = 0; i < n; i++) {
    const hi = lo + niceStep;
    bands.push([lo, i === n - 1 ? Infinity : hi]);
    lo = hi;
  }
  return bands;
}

/** Libellé FR d'une tranche, formaté via eur(). */
function bandLabel([min, max]: Band): string {
  if (max === Infinity) return `${eur(min)} +`;
  if (min === 0) return `< ${eur(max)}`;
  return `${eur(min)} – ${eur(max)}`;
}

/**
 * Distribue les lignes par tranche de valeur (champ numérique).
 * `percent` = PART DU TOTAL des lignes valorisées (somme ≈ 100 %).
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
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return bands.map((band, i) => ({
    label: bandLabel(band),
    value: String(counts[i]),
    percent: Math.round((counts[i] / total) * 100),
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
