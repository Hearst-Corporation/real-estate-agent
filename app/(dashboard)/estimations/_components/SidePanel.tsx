"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-strings";
import { RECAP_FIELDS } from "@/lib/estimation/spec";
import { buildStaticMap } from "@/lib/estimation/staticmap";
import type { Coverage } from "@/lib/estimation/spec";
import type { Valuation, MarketAnalysis, ListingsFetchSource, PropertyData, FieldStatusMap } from "@/lib/estimation/types";

type Props = {
  id: string;
  valuation: Valuation;
  market: MarketAnalysis | null;
  property: PropertyData;
  fieldStatus: FieldStatusMap;
  coverage: Coverage;
};

const fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const LISTING_TITLE_MAX_CHARS = 40;

type MarketContextData = {
  summary: string | null;
  citations: { title: string; url: string }[];
  provider: string | null;
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

function formatValue(v: PropertyData[keyof PropertyData]): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? UI.common.yes : UI.common.no;
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 0 ? v : null;
  return null;
}

export function SidePanel({ id, valuation, market: marketProp, property, fieldStatus, coverage }: Props) {
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoaded, setMarketLoaded] = useState(false);
  const [market, setMarket] = useState<MarketContextData | null>(null);
  const [ficheOpen, setFicheOpen] = useState(true);

  const listings = marketProp?.listing_comparables ?? [];
  const listingFetchSource = (marketProp?.listing_source?.source ?? null) as ListingsFetchSource | null;
  const listingFallbackUsed = marketProp?.listing_source?.fallbackUsed ?? false;

  // Carte de secteur (tuiles OSM) : bien estimé + annonces géolocalisées.
  const sectorMap = buildStaticMap({
    subject:
      marketProp?.subject_lat != null && marketProp?.subject_lon != null
        ? { lat: marketProp.subject_lat, lon: marketProp.subject_lon }
        : null,
    listings: listings
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => ({ lat: l.lat as number, lon: l.lon as number })),
    width: 560,
    height: 240,
  });
  const marketHasContent = Boolean(market && (market.summary || market.citations.length > 0));

  const filledFields = RECAP_FIELDS.filter(({ field }) => {
    const v = property[field];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== "";
  });

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

  return (
    <div className="est-side">
      {/* ── Fiche bien (accordéon, pleine largeur multi-colonnes) ── */}
      <div className="est-side-section span2">
        <button
          className="est-side-header"
          onClick={() => setFicheOpen((v) => !v)}
          aria-expanded={ficheOpen}
        >
          <span>{UI.estimations.ficheTitle}</span>
          <span className="est-side-stepper">
            {"●".repeat(Math.min(coverage.collected, coverage.total))}
            {"○".repeat(Math.max(0, coverage.total - coverage.collected))}
          </span>
          <span className="est-side-chevron">{ficheOpen ? "▲" : "▼"}</span>
        </button>
        {ficheOpen && (
          <div className="est-side-fiche">
            {filledFields.length === 0 ? (
              <p className="ct-placeholder">{UI.estimations.ficheEmpty}</p>
            ) : (
              filledFields.map(({ field, label }) => {
                const formatted = formatValue(property[field]);
                const toConfirm = fieldStatus[field] === "to_confirm";
                return (
                  <div key={field} className="est-side-fiche-row">
                    <span className="est-side-fiche-label">{label}</span>
                    <span className="est-side-fiche-value">
                      {formatted}
                      {toConfirm && (
                        <span className="est-fiche-confirm">{UI.estimations.toConfirm}</span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Ajustements ── */}
      {valuation.adjustments.length > 0 && (
        <div className="est-side-section">
          <div className="est-side-header static">
            <span>{UI.estimations.adjustmentsTitle}</span>
          </div>
          <ul className="est-adjust-list est-side-body">
            {valuation.adjustments.map((adj, i) => (
              <li key={i} className="est-adjust-row">
                <span className={`est-adjust-pct${adj.type === "premium" ? " premium" : ""}`}>
                  {adj.type === "premium" ? UI.estimations.premiumSign : UI.estimations.discountSign}
                  {Math.abs(adj.pct)}%
                </span>
                <span className="est-adjust-body">
                  <strong className="est-adjust-label">{adj.label}</strong>
                  {adj.rationale && (
                    <span className="est-adjust-note">
                      {UI.estimations.adjustSeparator}{adj.rationale}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Contexte marché ── */}
      <div className="est-side-section">
        <div className="est-side-header static">
          <span>{UI.estimations.marketContextTitle}</span>
        </div>
        <div className="est-side-body">
          {!marketLoaded && (
            <>
              <p className="est-adjust-note">{UI.estimations.marketContextHint}</p>
              <button
                className="ct-seg-btn"
                onClick={handleMarketContext}
                disabled={marketLoading}
              >
                {marketLoading ? UI.estimations.marketContextLoading : UI.estimations.marketContextCta}
              </button>
            </>
          )}
          {marketLoaded && !marketHasContent && (
            <p className="est-adjust-note">{UI.estimations.marketContextEmpty}</p>
          )}
          {marketLoaded && marketHasContent && market && (
            <>
              {market.summary && <p className="est-market-summary">{market.summary}</p>}
              {market.citations.length > 0 && (
                <ul className="est-market-sources">
                  {market.citations.map((c, i) => (
                    <li key={i}>
                      <a href={safeHref(c.url)} target="_blank" rel="noreferrer">{c.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Annonces comparables ── */}
      {marketProp != null && (
        <div className="est-side-section span2">
          <div className="est-side-header static">
            <span>{UI.estimations.listingComparablesTitle}</span>
          </div>
          <div className="est-side-body">
            {listingFetchSource != null && (
              <p className="ct-placeholder ct-placeholder-sm ct-mb-sm">
                {UI.estimations.listingFetchSourcePrefix}{" "}
                <strong>
                  {listingFallbackUsed && listingFetchSource !== "none"
                    ? UI.estimations.listingFetchSourceLabels["myswarms"]
                    : (UI.estimations.listingFetchSourceLabels[listingFetchSource] ?? listingFetchSource)}
                </strong>
              </p>
            )}
            {sectorMap && (
              <figure
                className="est-sectormap"
                style={{ width: sectorMap.width, height: sectorMap.height }}
                aria-label={UI.estimations.sectorMapTitle}
              >
                <div className="est-sectormap-tiles">
                  {sectorMap.tiles.map((t, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={i}
                      src={t.url}
                      alt=""
                      width={256}
                      height={256}
                      style={{ position: "absolute", left: t.left, top: t.top }}
                    />
                  ))}
                </div>
                {sectorMap.listings.map((m, i) => (
                  <span key={i} className="est-mappin" style={{ left: m.left, top: m.top }}>
                    {i + 1}
                  </span>
                ))}
                {sectorMap.subject && (
                  <span className="est-mappin me" style={{ left: sectorMap.subject.left, top: sectorMap.subject.top }} />
                )}
                <figcaption className="est-sectormap-attr">{UI.estimations.sectorMapAttribution}</figcaption>
              </figure>
            )}
            {listings.length === 0 ? (
              <p className="ct-placeholder">{UI.estimations.listingComparablesEmpty}</p>
            ) : (
              <div className="est-listing-table-wrap">
                <table className="est-listing-table">
                  <thead>
                    <tr>
                      <th aria-hidden="true" />
                      <th>{UI.estimations.listingColAnnonce}</th>
                      <th>{UI.estimations.listingColPrix}</th>
                      <th>{UI.estimations.listingColSurface}</th>
                      <th>{UI.estimations.listingColPrixM2}</th>
                      <th>{UI.estimations.listingColActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((item, i) => (
                      <tr key={item.id}>
                        <td className="est-listing-photo">
                          {item.photo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={item.photo_url} alt={UI.estimations.listingPhotoAlt} loading="lazy" />
                          ) : (
                            <span className="est-listing-photo-ph" />
                          )}
                          <span className="est-listing-photo-no">{i + 1}</span>
                        </td>
                        <td>
                          {item.titre.length > LISTING_TITLE_MAX_CHARS
                            ? item.titre.slice(0, LISTING_TITLE_MAX_CHARS) + "…"
                            : item.titre}
                        </td>
                        <td className="ct-table-num">{fmt.format(item.prix)}</td>
                        <td className="ct-table-num">{item.surface_m2}{UI.estimations.surfaceUnit}</td>
                        <td className="ct-table-num">{fmt.format(item.prix_m2)}{UI.estimations.perSqmUnit}</td>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
