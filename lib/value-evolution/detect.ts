/**
 * lib/value-evolution/detect.ts — DÉTECTION de variation de valeur (PURE).
 *
 * Fonctions pures : reçoivent des lignes `estimations` déjà lues (owner-scoped
 * user+tenant côté appelant) et produisent des séries d'évolution + variations
 * déterministes et explicables. Aucune I/O, aucune donnée fabriquée, zéro React.
 *
 * Règle de valeur : on retient `recommended_price` en priorité (prix conseillé
 * de mise en vente), sinon `market_value`. Un point sans aucune valeur exploitable
 * est écarté. Regroupement d'un bien : `property_id` si présent, sinon adresse
 * normalisée (les estimations libres sans bien rattaché restent comparables).
 */

import { MIN_POINTS, SIGNIFICANT_MIN_EUR, SIGNIFICANT_PCT } from "@/config/value-evolution";
import type {
  EstimationRow,
  RelanceOpportunity,
  ValuePoint,
  ValueSeries,
  ValueVariation,
} from "@/lib/value-evolution/types";

/** Seuils injectables (facilite les tests) ; défaut = config d'env. */
export type Thresholds = { pct: number; minEur: number; minPoints: number };

export const DEFAULT_THRESHOLDS: Thresholds = {
  pct: SIGNIFICANT_PCT,
  minEur: SIGNIFICANT_MIN_EUR,
  minPoints: MIN_POINTS,
};

/** Extrait la valeur exploitable d'une estimation (priorité prix conseillé). */
export function valueOf(
  row: EstimationRow,
): { value: number; source: ValuePoint["source"] } | null {
  const rec = row.recommended_price;
  if (typeof rec === "number" && Number.isFinite(rec) && rec > 0) {
    return { value: rec, source: "recommended_price" };
  }
  const mkt = row.market_value;
  if (typeof mkt === "number" && Number.isFinite(mkt) && mkt > 0) {
    return { value: mkt, source: "market_value" };
  }
  return null;
}

/** Adresse lisible depuis le JSON `property` (best-effort, jamais de crash). */
export function addressOf(row: EstimationRow): string | null {
  const p = row.property;
  if (p && typeof p === "object") {
    const rec = p as Record<string, unknown>;
    const a = rec.adresse ?? rec.address;
    if (typeof a === "string" && a.trim()) return a.trim();
  }
  return null;
}

/** Normalise une adresse pour le regroupement (casse/espaces/accents). */
export function normalizeAddress(addr: string): string {
  return addr
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Date effective d'une estimation (valued_at si présent, sinon created_at). */
function effectiveDate(row: EstimationRow): string {
  return row.valued_at ?? row.created_at;
}

/** Clé de regroupement d'un bien : property_id prioritaire, sinon adresse. */
function groupKey(row: EstimationRow): { key: string; label: string } | null {
  if (row.property_id) {
    return { key: `prop:${row.property_id}`, label: addressOf(row) ?? row.property_id };
  }
  const addr = addressOf(row);
  if (addr) return { key: `addr:${normalizeAddress(addr)}`, label: addr };
  return null; // ni bien ni adresse → non regroupable, ignoré
}

/**
 * Calcule la variation entre le premier et le dernier point d'une série.
 * Déterministe : |deltaPct| ≥ pct ET |deltaEur| ≥ minEur ⇒ significatif.
 */
export function computeVariation(
  points: ValuePoint[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): ValueVariation | null {
  if (points.length < thresholds.minPoints) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const deltaEur = last - first;
  const deltaPct = first > 0 ? (deltaEur / first) * 100 : 0;
  const direction: ValueVariation["direction"] =
    deltaEur > 0 ? "up" : deltaEur < 0 ? "down" : "flat";
  const significant =
    Math.abs(deltaPct) >= thresholds.pct && Math.abs(deltaEur) >= thresholds.minEur;
  return { direction, deltaEur, deltaPct, significant };
}

/**
 * Construit les séries d'évolution de valeur à partir des lignes estimations.
 * Regroupe par bien, écarte les points sans valeur, trie chronologiquement,
 * calcule la variation. Résultat trié : significatifs d'abord, puis |deltaPct| ↓.
 */
export function buildSeries(
  rows: readonly EstimationRow[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): ValueSeries[] {
  const groups = new Map<string, { label: string; rows: EstimationRow[] }>();

  for (const row of rows) {
    if (!valueOf(row)) continue; // point sans valeur → inutile
    const g = groupKey(row);
    if (!g) continue;
    const bucket = groups.get(g.key);
    if (bucket) {
      bucket.rows.push(row);
      if (!bucket.label && g.label) bucket.label = g.label;
    } else {
      groups.set(g.key, { label: g.label, rows: [row] });
    }
  }

  const series: ValueSeries[] = [];
  for (const [key, bucket] of groups) {
    const sorted = [...bucket.rows].sort(
      (a, b) => Date.parse(effectiveDate(a)) - Date.parse(effectiveDate(b)),
    );
    const points: ValuePoint[] = sorted.map((row) => {
      const v = valueOf(row)!;
      return { estimationId: row.id, at: effectiveDate(row), value: v.value, source: v.source };
    });
    if (points.length === 0) continue;
    const latest = sorted[sorted.length - 1];
    series.push({
      key,
      propertyId: latest.property_id ?? null,
      ownerLeadId: latest.owner_lead_id ?? null,
      label: bucket.label,
      points,
      variation: computeVariation(points, thresholds),
    });
  }

  series.sort((a, b) => {
    const sa = a.variation?.significant ? 1 : 0;
    const sb = b.variation?.significant ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return Math.abs(b.variation?.deltaPct ?? 0) - Math.abs(a.variation?.deltaPct ?? 0);
  });
  return series;
}

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Formate un pourcentage signé français (ex. « +6,4 % », « −5,0 % »). */
export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Formate un montant euros signé (ex. « +12 000 € »). */
export function formatDeltaEur(eur: number): string {
  const sign = eur > 0 ? "+" : eur < 0 ? "−" : "";
  return `${sign}${EUR.format(Math.abs(eur))}`;
}

/**
 * Génère une opportunité de relance propriétaire depuis une série à variation
 * significative. Retourne null si la série n'est pas significative.
 * Le corps est un BROUILLON (à valider) — jamais envoyé automatiquement.
 */
export function relanceFromSeries(series: ValueSeries): RelanceOpportunity | null {
  const v = series.variation;
  if (!v?.significant) return null;

  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  const sens = v.direction === "up" ? "progressé" : "évolué";
  const detail =
    v.direction === "up"
      ? "Le marché vous est favorable : c'est le bon moment pour envisager la mise en vente ou réévaluer votre stratégie."
      : "Le marché a bougé : je vous propose de refaire le point ensemble sur le positionnement de votre bien.";

  const subject = `Votre bien${series.label ? ` — ${series.label}` : ""} : la valeur estimée a ${sens} de ${formatPct(v.deltaPct)}`;
  const body = [
    "Bonjour,",
    "",
    `Je reviens vers vous au sujet de votre bien${series.label ? ` situé ${series.label}` : ""}.`,
    "",
    `Entre notre première estimation (${EUR.format(first.value)}) et la plus récente (${EUR.format(last.value)}), la valeur estimée a ${sens} de ${formatDeltaEur(v.deltaEur)} (${formatPct(v.deltaPct)}).`,
    "",
    detail,
    "",
    "Seriez-vous disponible pour en discuter ?",
    "",
    "Bien à vous,",
  ].join("\n");

  return {
    seriesKey: series.key,
    propertyId: series.propertyId,
    ownerLeadId: series.ownerLeadId,
    label: series.label,
    variation: v,
    subject,
    body,
  };
}

/** Toutes les opportunités de relance issues d'un jeu de séries (significatives). */
export function relanceOpportunities(series: readonly ValueSeries[]): RelanceOpportunity[] {
  const out: RelanceOpportunity[] = [];
  for (const s of series) {
    const r = relanceFromSeries(s);
    if (r) out.push(r);
  }
  return out;
}
