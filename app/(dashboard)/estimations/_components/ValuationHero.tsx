"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AccentButton } from "./AccentButton";
import { UI } from "@/lib/ui-strings";
import type { Valuation, MarketAnalysis, PropertyData } from "@/lib/estimation/types";

type Props = {
  id: string;
  valuation: Valuation;
  property?: PropertyData | null;
  market?: MarketAnalysis | null;
};

const fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const SHARE_COPIED_RESET_MS = 2500;

/** Position en % d'une valeur dans la fourchette [low, high], bornée [0, 100]. */
function pct(value: number, low: number, high: number): number {
  const span = Math.max(1, high - low);
  return Math.min(100, Math.max(0, ((value - low) / span) * 100));
}

const CONFIDENCE_COLOR: Record<string, string> = {
  indicative: "border-zinc-950/15 bg-zinc-950/5 text-zinc-600",
  moyenne: "border-zinc-950/15 bg-zinc-950/[0.06] text-zinc-700",
  elevee: "border-accent-400/50 bg-accent-500/15 text-accent-700",
};

const DATA_STATUS_COLOR: Record<string, string> = {
  complete: "bg-accent-500",
  partial: "bg-accent-300",
  degraded: "bg-zinc-300",
};

export function ValuationHero({ id, valuation, property, market }: Props) {
  const [shareLabel, setShareLabel] = useState<string>(UI.estimations.share);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/estimations/${id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = (await res.json()) as { shareUrl: string };
        await navigator.clipboard.writeText(data.shareUrl);
        setShareLabel(UI.estimations.shareCopied);
        setTimeout(() => setShareLabel(UI.estimations.share), SHARE_COPIED_RESET_MS);
      }
    } catch {
      // best-effort
    } finally {
      setSharing(false);
    }
  }

  const confidenceLabel =
    UI.estimations.confidenceLabels[valuation.confidence] ?? valuation.confidence;
  const confidenceTooltip =
    UI.estimations.confidenceTooltips[valuation.confidence] ?? "";
  const confidenceColor = CONFIDENCE_COLOR[valuation.confidence] ?? CONFIDENCE_COLOR.moyenne;

  const marketPct = pct(valuation.marketValue, valuation.lowValue, valuation.highValue);
  const recoPct = pct(
    valuation.recommendedListingPrice,
    valuation.lowValue,
    valuation.highValue
  );

  // ── Identité du bien (contexte de la valeur) ──
  const typeLabel = property?.type_bien
    ? UI.estimations.typeLabels[property.type_bien] ?? UI.estimations.fallbackName
    : UI.estimations.fallbackName;
  const location = property?.ville ?? property?.adresse ?? null;
  const surface = property?.surface_carrez_m2 ?? property?.surface_habitable_m2 ?? null;
  const dpe = property?.dpe_classe ?? null;

  // ── Facteurs de fiabilité (défendables) ──
  // `confidenceFactors` / `dataStatus` peuvent manquer sur des estimations
  // antérieures à ces champs → on n'affiche QUE ce qui existe (honnête, jamais
  // de valeur inventée), et le bloc entier disparaît s'il n'y a rien à montrer.
  const cf = valuation.confidenceFactors ?? null;
  const nbComp = valuation.nbComparables ?? 0;
  const provenanceFacts: string[] = [];
  if (market?.prix_median_m2)
    provenanceFacts.push(
      `${UI.estimations.medianPriceLabel} ${fmt.format(market.prix_median_m2)}${UI.estimations.perSqmUnit}`
    );
  if (market?.tendance)
    provenanceFacts.push(
      `${UI.estimations.trendLabel} · ${UI.estimations.trendLabels[market.tendance] ?? market.tendance}`
    );
  if (cf?.distanceMoyenneKm != null)
    provenanceFacts.push(UI.estimations.radiusLabel(cf.distanceMoyenneKm));
  if (cf?.recenceMoyenneMois != null)
    provenanceFacts.push(UI.estimations.recencyLabel(cf.recenceMoyenneMois));
  if (cf?.cvPrixM2 != null)
    provenanceFacts.push(UI.estimations.dispersionLabel(cf.cvPrixM2 * 100));

  const dataStatusLabel =
    valuation.dataStatus && valuation.dataStatus in UI.estimations.dataStatusLabels
      ? UI.estimations.dataStatusLabels[valuation.dataStatus]
      : null;
  const dataStatusTooltip = valuation.dataStatus
    ? UI.estimations.dataStatusTooltips[valuation.dataStatus] ?? ""
    : "";
  const dataStatusDot =
    (valuation.dataStatus && DATA_STATUS_COLOR[valuation.dataStatus]) ??
    DATA_STATUS_COLOR.partial;
  const provenanceHeader =
    nbComp > 0 ? UI.estimations.basedOnComparables(nbComp) : UI.estimations.provenanceTitle;
  const showProvenance =
    nbComp > 0 || provenanceFacts.length > 0 || dataStatusLabel !== null;

  return (
    <div className="surface flex flex-col gap-6 p-6 sm:p-8">
      {/* ── Ligne d'identité + confiance ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-titre text-base font-semibold text-zinc-950">
            {typeLabel}
          </span>
          {location && (
            <span className="truncate text-zinc-500">· {location}</span>
          )}
          {surface != null && (
            <span className="text-zinc-500 tabular-nums">
              · {surface}
              {UI.estimations.surfaceUnit}
            </span>
          )}
          {dpe && (
            <span className="inline-flex items-center rounded-md border border-zinc-950/10 bg-zinc-950/[0.04] px-1.5 py-0.5 text-xs font-semibold text-zinc-700">
              {UI.estimations.dpeBadge(dpe)}
            </span>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceColor}`}
          title={confidenceTooltip}
        >
          {confidenceLabel}
        </span>
      </div>

      {/* ── Valeur dominante ── */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
          {UI.estimations.market}
        </p>
        <p className="font-titre text-4xl font-semibold leading-none tracking-tight text-zinc-950 tabular-nums sm:text-5xl lg:text-6xl">
          {fmt.format(valuation.marketValue)}
        </p>
      </div>

      {/* ── Fourchette visuelle ── */}
      <div className="flex flex-col gap-2">
        <div
          className="relative h-2 rounded-full bg-zinc-950/10"
          role="img"
          aria-label={`${UI.estimations.rangeLabel} ${fmt.format(
            valuation.lowValue
          )} à ${fmt.format(valuation.highValue)}, valeur de marché ${fmt.format(
            valuation.marketValue
          )}`}
        >
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-400"
            style={{ left: `${recoPct}%` }}
          />
          <span
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-500 shadow-[var(--shadow-card)]"
            style={{ left: `${marketPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs tabular-nums text-zinc-500">
          <span>{fmt.format(valuation.lowValue)}</span>
          <span className="font-medium text-zinc-600">
            {UI.estimations.recoPriceLabel} · {fmt.format(valuation.recommendedListingPrice)}
          </span>
          <span>{fmt.format(valuation.highValue)}</span>
        </div>
      </div>

      {/* ── KPIs secondaires (inline, non encagés) ── */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-zinc-950/10 pt-4">
        <div>
          <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            {UI.estimations.perSqm}
          </span>
          <span className="mt-0.5 block text-lg font-semibold text-zinc-950 tabular-nums">
            {fmt.format(valuation.adjustedPerM2)}
            {UI.estimations.perSqmUnit}
          </span>
        </div>
        <div>
          <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            {UI.estimations.recommended}
          </span>
          <span className="mt-0.5 block text-lg font-semibold text-accent-700 tabular-nums">
            {fmt.format(valuation.recommendedListingPrice)}
          </span>
        </div>
      </div>

      {/* ── Provenance & fiabilité (crédibilité) ── */}
      {showProvenance && (
        <div className="flex flex-col gap-2 rounded-xl bg-lin-brut/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-sm font-semibold text-zinc-800">{provenanceHeader}</span>
            {dataStatusLabel && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600"
                title={dataStatusTooltip}
              >
                <span className={`size-2 rounded-full ${dataStatusDot}`} aria-hidden="true" />
                {dataStatusLabel}
              </span>
            )}
          </div>
          {provenanceFacts.length > 0 && (
            <p className="text-xs leading-relaxed text-zinc-500">
              {provenanceFacts.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-2">
        <AccentButton
          href={`/api/estimations/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          {UI.estimations.downloadPdf}
        </AccentButton>
        <Button outline onClick={handleShare} disabled={sharing}>
          {shareLabel}
        </Button>
      </div>
    </div>
  );
}
