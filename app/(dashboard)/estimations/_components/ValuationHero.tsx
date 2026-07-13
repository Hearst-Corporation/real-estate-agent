"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UI } from "@/lib/ui-strings";
import type { Valuation } from "@/lib/estimation/types";

type Props = {
  id: string;
  valuation: Valuation;
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
  elevee: "border-accent-400/40 bg-accent-500/15 text-accent-700",
};

export function ValuationHero({ id, valuation }: Props) {
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

  return (
    <div className="surface flex flex-col gap-6 p-6 lg:flex-row lg:items-stretch">
      {/* ── Colonne valeur : badge, valeur, fourchette visuelle ── */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceColor}`}
            title={confidenceTooltip}
          >
            {confidenceLabel}
          </span>
          {valuation.nbComparables > 0 && (
            <span className="text-xs text-zinc-500">
              {UI.estimations.comparablesDvf(valuation.nbComparables)}
            </span>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            {UI.estimations.market}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-accent-700 tabular-nums">
            {fmt.format(valuation.marketValue)}
          </p>
        </div>

        <div
          className="relative mt-2 h-1.5 rounded-full bg-zinc-950/10"
          role="img"
          aria-label={`Fourchette ${fmt.format(valuation.lowValue)} à ${fmt.format(
            valuation.highValue
          )}, valeur de marché ${fmt.format(valuation.marketValue)}`}
        >
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-400"
            style={{ left: `${recoPct}%` }}
          />
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-500"
            style={{ left: `${marketPct}%` }}
          />
        </div>
        <p className="flex items-center justify-between text-xs text-zinc-500">
          <span>{fmt.format(valuation.lowValue)}</span>
          <span className="font-medium text-zinc-600">
            {UI.estimations.recoPriceLabel} · {fmt.format(valuation.recommendedListingPrice)}
          </span>
          <span>{fmt.format(valuation.highValue)}</span>
        </p>
      </div>

      {/* ── Colonne droite : KPIs + actions ── */}
      <div className="flex flex-col justify-between gap-4 lg:w-56 lg:shrink-0">
        <div className="flex flex-col gap-3">
          <div className="surface p-3">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              {UI.estimations.perSqm}
            </span>
            <span className="mt-1 block text-lg font-bold text-zinc-950">
              {fmt.format(valuation.adjustedPerM2)}
              {UI.estimations.perSqmUnit}
            </span>
          </div>
          <div className="surface p-3">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              {UI.estimations.recommended}
            </span>
            <span className="mt-1 block text-lg font-bold text-accent-700">
              {fmt.format(valuation.recommendedListingPrice)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            color="indigo"
            href={`/api/estimations/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            {UI.estimations.downloadPdf}
          </Button>
          <Button outline onClick={handleShare} disabled={sharing}>
            {shareLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
