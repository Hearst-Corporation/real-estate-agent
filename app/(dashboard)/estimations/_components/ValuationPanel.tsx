"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-strings";
import type { Valuation, MarketAnalysis, ListingsFetchSource } from "@/lib/estimation/types";

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

/** Durée d'affichage du libellé « Lien copié » avant retour à « Partager ». */
const SHARE_COPIED_RESET_MS = 2500;
const LISTING_TITLE_MAX_CHARS = 45;

type MarketContextData = {
  summary: string | null;
  citations: { title: string; url: string }[];
  provider: string | null;
  reason?: string;
};

function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function ValuationPanel({ id, valuation, market: marketProp }: Props) {
  const [shareLabel, setShareLabel] = useState<string>(UI.estimations.share);
  const [sharing, setSharing] = useState(false);

  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoaded, setMarketLoaded] = useState(false);
  const [market, setMarket] = useState<MarketContextData | null>(null);

  async function handleMarketContext() {
    if (marketLoading) return;
    setMarketLoading(true);
    try {
      const res = await fetch(`/api/estimations/${id}/market-context`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = res.ok ? ((await res.json()) as MarketContextData) : null;
      setMarket(data);
    } catch {
      setMarket(null);
    } finally {
      setMarketLoaded(true);
      setMarketLoading(false);
    }
  }

  const marketHasContent = Boolean(market && (market.summary || market.citations.length > 0));
  const listings = marketProp?.listing_comparables ?? [];
  const listingFetchSource = (marketProp?.listing_source?.source ?? null) as ListingsFetchSource | null;
  const listingFallbackUsed = marketProp?.listing_source?.fallbackUsed ?? false;

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
          <span className="ct-kpi-value">{fmt.format(valuation.adjustedPerM2)}{UI.estimations.perSqmUnit}</span>
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

      {/* ── Contexte marché (hors prix) ── */}
      <div className="ct-card est-valuation-block">
        <p className="ct-card-title">{UI.estimations.marketContextTitle}</p>
        {!marketLoaded && (
          <div className="ct-card-body">
            <p className="est-adjust-note">{UI.estimations.marketContextHint}</p>
            <button
              className="ct-seg-btn"
              onClick={handleMarketContext}
              disabled={marketLoading}
            >
              {marketLoading ? UI.estimations.marketContextLoading : UI.estimations.marketContextCta}
            </button>
          </div>
        )}
        {marketLoaded && !marketHasContent && (
          <p className="ct-card-body est-adjust-note">{UI.estimations.marketContextEmpty}</p>
        )}
        {marketLoaded && marketHasContent && market && (
          <div className="ct-card-body">
            {market.summary && <p className="est-market-summary">{market.summary}</p>}
            {market.citations.length > 0 && (
              <>
                <p className="est-adjust-note">{UI.estimations.marketContextSources}</p>
                <ul className="est-market-sources">
                  {market.citations.map((c, i) => (
                    <li key={i}>
                      <a href={safeHref(c.url)} target="_blank" rel="noreferrer">{c.title}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Annonces comparables ── */}
      {marketProp != null && (
        <div className="ct-card est-valuation-block">
          <p className="ct-card-title">{UI.estimations.listingComparablesTitle}</p>
          {listingFetchSource != null && (
            <p className="ct-placeholder est-listing-source-badge">
              {UI.estimations.listingFetchSourcePrefix}{" "}
              <strong>
                {listingFallbackUsed && listingFetchSource !== "none"
                  ? UI.estimations.listingFetchSourceLabels["myswarms"]
                  : (UI.estimations.listingFetchSourceLabels[listingFetchSource] ?? listingFetchSource)}
              </strong>
            </p>
          )}
          {listings.length === 0 ? (
            <p className="ct-placeholder">{UI.estimations.listingComparablesEmpty}</p>
          ) : (
            <table className="est-listing-table">
              <thead>
                <tr>
                  <th>{UI.estimations.listingColAnnonce}</th>
                  <th>{UI.estimations.listingColSource}</th>
                  <th>{UI.estimations.listingColPrix}</th>
                  <th>{UI.estimations.listingColSurface}</th>
                  <th>{UI.estimations.listingColPrixM2}</th>
                  <th>{UI.estimations.listingColActions}</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.titre.length > LISTING_TITLE_MAX_CHARS ? item.titre.slice(0, LISTING_TITLE_MAX_CHARS) + "…" : item.titre}
                    </td>
                    <td>
                      {UI.estimations.listingSourceLabels[item.source] ?? item.source}
                    </td>
                    <td>
                      {fmt.format(item.prix)}
                    </td>
                    <td>
                      {item.surface_m2}{UI.estimations.surfaceUnit}
                    </td>
                    <td>
                      {fmt.format(item.prix_m2)}{UI.estimations.perSqmUnit}
                    </td>
                    <td>
                      {item.url ? (
                        <a
                          href={safeHref(item.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="est-listing-link"
                        >
                          {UI.estimations.listingComparablesLink}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
