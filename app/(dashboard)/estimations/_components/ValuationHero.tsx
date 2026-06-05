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

  const confidenceBadge: Record<string, string> = {
    indicative: "Indicative",
    moyenne: "Moyenne",
    elevee: "Élevée",
  };

  return (
    <div className="est-hero">
      {/* ── Badge confiance ── */}
      <div className="est-hero-meta">
        <span className="est-hero-badge">
          {confidenceBadge[valuation.confidence] ?? valuation.confidence}
        </span>
        {valuation.nbComparables > 0 && (
          <span className="est-hero-comps">
            {valuation.nbComparables} comparables DVF
          </span>
        )}
      </div>

      {/* ── Valeur centrale ── */}
      <div className="est-hero-center">
        <p className="est-hero-label">{UI.estimations.market}</p>
        <p className="est-hero-value">{fmt.format(valuation.marketValue)}</p>
        <p className="est-hero-range">
          <span>{fmt.format(valuation.lowValue)}</span>
          <span className="est-hero-range-sep">–</span>
          <span>{fmt.format(valuation.highValue)}</span>
        </p>
      </div>

      {/* ── KPIs secondaires ── */}
      <div className="est-hero-kpis">
        <div className="est-hero-kpi">
          <span className="est-hero-kpi-label">{UI.estimations.perSqm}</span>
          <span className="est-hero-kpi-value">
            {fmt.format(valuation.adjustedPerM2)}{UI.estimations.perSqmUnit}
          </span>
        </div>
        <div className="est-hero-kpi">
          <span className="est-hero-kpi-label">{UI.estimations.recommended}</span>
          <span className="est-hero-kpi-value">
            {fmt.format(valuation.recommendedListingPrice)}
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
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
  );
}
