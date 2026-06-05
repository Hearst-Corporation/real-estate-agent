"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-strings";
import type { Valuation, MarketAnalysis } from "@/lib/estimation/types";

type Props = {
  id: string;
  valuation: Valuation;
  market: MarketAnalysis | null;
};

const fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const fmtPerSqm = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Durée d'affichage du libellé « Lien copié » avant retour à « Partager ». */
const SHARE_COPIED_RESET_MS = 2500;

export function ValuationPanel({ id, valuation }: Props) {
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
        const data = (await res.json()) as { shareUrl: string; emailSent: boolean };
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

  return (
    <div className="est-valuation">
      {/* ── KPI row ── */}
      <p className="ct-card-title">{UI.estimations.valuationTitle}</p>

      <div className="ct-kpi-grid cols-3">
        <div className="ct-kpi-card">
          <span className="ct-kpi-label">{UI.estimations.low}</span>
          <span className="ct-kpi-value">{fmt.format(valuation.lowValue)}</span>
        </div>

        <div className="ct-kpi-card accent">
          <span className="ct-kpi-label">{UI.estimations.market}</span>
          <span className="ct-kpi-value">{fmt.format(valuation.marketValue)}</span>
        </div>

        <div className="ct-kpi-card">
          <span className="ct-kpi-label">{UI.estimations.high}</span>
          <span className="ct-kpi-value">{fmt.format(valuation.highValue)}</span>
        </div>
      </div>

      {/* ── Prix au m² + conseillé ── */}
      <div className="ct-kpi-grid cols-2 est-valuation-block">
        <div className="ct-kpi-card">
          <span className="ct-kpi-label">{UI.estimations.perSqm}</span>
          <span className="ct-kpi-value">{fmtPerSqm.format(valuation.adjustedPerM2)}{UI.estimations.perSqmUnit}</span>
        </div>
        <div className="ct-kpi-card">
          <span className="ct-kpi-label">{UI.estimations.recommended}</span>
          <span className="ct-kpi-value">{fmt.format(valuation.recommendedListingPrice)}</span>
        </div>
      </div>

      {/* ── Ajustements ── */}
      {valuation.adjustments.length > 0 && (
        <div className="ct-card est-valuation-block">
          <p className="ct-card-title">{UI.estimations.adjustmentsTitle}</p>
          <ul className="ct-card-body est-adjust-list">
            {valuation.adjustments.map((adj, i) => (
              <li key={i} className="est-adjust-row">
                <span className={`est-adjust-pct${adj.type === "premium" ? " premium" : ""}`}>
                  {adj.type === "premium" ? UI.estimations.premiumSign : UI.estimations.discountSign}{Math.abs(adj.pct)}%
                </span>
                <span className="est-adjust-body">
                  <strong className="est-adjust-label">{adj.label}</strong>
                  {adj.rationale && (
                    <span className="est-adjust-note">{UI.estimations.adjustSeparator}{adj.rationale}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="est-valuation-actions">
        <a
          href={`/api/estimations/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="ct-seg-btn primary"
          style={{ display: "inline-block", textDecoration: "none" }}
        >
          {UI.estimations.downloadPdf}
        </a>
        <button
          className="ct-seg-btn"
          onClick={handleShare}
          disabled={sharing}
        >
          {shareLabel}
        </button>
      </div>
    </div>
  );
}
