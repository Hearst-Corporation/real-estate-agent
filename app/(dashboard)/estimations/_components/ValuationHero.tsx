"use client";

import { useState } from "react";
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
  indicative: "muted",
  moyenne: "base",
  elevee: "accent",
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
  const confidenceColor = CONFIDENCE_COLOR[valuation.confidence] ?? "base";

  const marketPct = pct(valuation.marketValue, valuation.lowValue, valuation.highValue);
  const recoPct = pct(
    valuation.recommendedListingPrice,
    valuation.lowValue,
    valuation.highValue
  );

  return (
    <div className="est-hero">
      {/* ── Colonne valeur : badge, valeur, fourchette visuelle ── */}
      <div className="est-hero-main">
        <div className="est-hero-meta">
          <span
            className={`est-hero-badge est-hero-badge--${confidenceColor}`}
            title={confidenceTooltip}
          >
            {confidenceLabel}
          </span>
          {valuation.nbComparables > 0 && (
            <span className="est-hero-comps">
              {UI.estimations.comparablesDvf(valuation.nbComparables)}
            </span>
          )}
        </div>

        <div className="est-hero-center">
          <p className="est-hero-label">{UI.estimations.market}</p>
          <p className="est-hero-value">{fmt.format(valuation.marketValue)}</p>
        </div>

        <div
          className="est-hero-bar"
          role="img"
          aria-label={`Fourchette ${fmt.format(valuation.lowValue)} à ${fmt.format(
            valuation.highValue
          )}, valeur de marché ${fmt.format(valuation.marketValue)}`}
        >
          <span className="est-hero-bar-reco" style={{ left: `${recoPct}%` }} />
          <span className="est-hero-bar-market" style={{ left: `${marketPct}%` }} />
        </div>
        <p className="est-hero-range">
          <span>{fmt.format(valuation.lowValue)}</span>
          <span className="reco-lab">
            {UI.estimations.recoPriceLabel} · {fmt.format(valuation.recommendedListingPrice)}
          </span>
          <span>{fmt.format(valuation.highValue)}</span>
        </p>
      </div>

      {/* ── Colonne droite : KPIs + actions ── */}
      <div className="est-hero-side">
        <div className="est-hero-kpis">
          <div className="est-hero-kpi">
            <span className="est-hero-kpi-label">{UI.estimations.perSqm}</span>
            <span className="est-hero-kpi-value">
              {fmt.format(valuation.adjustedPerM2)}
              {UI.estimations.perSqmUnit}
            </span>
          </div>
          <div className="est-hero-kpi">
            <span className="est-hero-kpi-label">{UI.estimations.recommended}</span>
            <span className="est-hero-kpi-value est-hero-kpi-value--accent">
              {fmt.format(valuation.recommendedListingPrice)}
            </span>
          </div>
        </div>

        <div className="est-hero-actions">
          <a
            href={`/api/estimations/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="ct-seg-btn primary est-hero-cta"
          >
            {UI.estimations.downloadPdf}
          </a>
          <button
            className="ct-seg-btn est-hero-cta"
            onClick={handleShare}
            disabled={sharing}
          >
            {shareLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
