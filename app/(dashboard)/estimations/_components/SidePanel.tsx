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
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
      {/* ── Fiche bien (accordéon, pleine largeur multi-colonnes) ── */}
      <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <button
          className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-100"
          onClick={() => setFicheOpen((v) => !v)}
          aria-expanded={ficheOpen}
        >
          <span>{UI.estimations.ficheTitle}</span>
          <span className="font-mono text-xs tracking-widest text-indigo-300">
            {"●".repeat(Math.min(coverage.collected, coverage.total))}
            {"○".repeat(Math.max(0, coverage.total - coverage.collected))}
          </span>
          <span className="text-xs text-slate-500">{ficheOpen ? "▲" : "▼"}</span>
        </button>
        {ficheOpen && (
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 @lg:grid-cols-2">
            {filledFields.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">{UI.estimations.ficheEmpty}</p>
            ) : (
              filledFields.map(({ field, label }) => {
                const formatted = formatValue(property[field]);
                const toConfirm = fieldStatus[field] === "to_confirm";
                return (
                  <div key={field} className="flex items-baseline justify-between gap-2 border-b border-white/5 py-1.5 text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-right text-slate-100">
                      {formatted}
                      {toConfirm && (
                        <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                          {UI.estimations.toConfirm}
                        </span>
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-slate-100">
            <span>{UI.estimations.adjustmentsTitle}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {valuation.adjustments.map((adj, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                    adj.type === "premium"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {adj.type === "premium" ? UI.estimations.premiumSign : UI.estimations.discountSign}
                  {Math.abs(adj.pct)}%
                </span>
                <span className="text-sm">
                  <strong className="font-semibold text-slate-100">{adj.label}</strong>
                  {adj.rationale && (
                    <span className="text-slate-400">
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-slate-100">
          <span>{UI.estimations.marketContextTitle}</span>
        </div>
        <div className="mt-3">
          {!marketLoaded && (
            <>
              <p className="text-sm text-slate-400">{UI.estimations.marketContextHint}</p>
              <button
                className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                onClick={handleMarketContext}
                disabled={marketLoading}
              >
                {marketLoading ? UI.estimations.marketContextLoading : UI.estimations.marketContextCta}
              </button>
            </>
          )}
          {marketLoaded && !marketHasContent && (
            <p className="text-sm text-slate-400">{UI.estimations.marketContextEmpty}</p>
          )}
          {marketLoaded && marketHasContent && market && (
            <>
              {market.summary && <p className="text-sm leading-relaxed text-slate-200">{market.summary}</p>}
              {market.citations.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {market.citations.map((c, i) => (
                    <li key={i}>
                      <a
                        href={safeHref(c.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
                      >
                        {c.title}
                      </a>
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
        <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-slate-100">
            <span>{UI.estimations.listingComparablesTitle}</span>
          </div>
          <div className="mt-3">
            {listingFetchSource != null && (
              <p className="mb-3 text-xs text-slate-500">
                {UI.estimations.listingFetchSourcePrefix}{" "}
                <strong className="font-semibold text-slate-300">
                  {listingFallbackUsed && listingFetchSource !== "none"
                    ? UI.estimations.listingFetchSourceLabels["myswarms"]
                    : (UI.estimations.listingFetchSourceLabels[listingFetchSource] ?? listingFetchSource)}
                </strong>
              </p>
            )}
            {sectorMap && (
              <figure
                className="relative mb-4 overflow-hidden rounded-xl border border-white/10"
                style={{ width: sectorMap.width, height: sectorMap.height }}
                aria-label={UI.estimations.sectorMapTitle}
              >
                <div className="absolute inset-0">
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
                  <span
                    key={i}
                    className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow"
                    style={{ left: m.left, top: m.top }}
                  >
                    {i + 1}
                  </span>
                ))}
                {sectorMap.subject && (
                  <span
                    className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow"
                    style={{ left: sectorMap.subject.left, top: sectorMap.subject.top }}
                  />
                )}
                <figcaption className="absolute bottom-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {UI.estimations.sectorMapAttribution}
                </figcaption>
              </figure>
            )}
            {listings.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">{UI.estimations.listingComparablesEmpty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                      <th aria-hidden="true" />
                      <th className="px-2 py-2 font-medium">{UI.estimations.listingColAnnonce}</th>
                      <th className="px-2 py-2 text-right font-medium">{UI.estimations.listingColPrix}</th>
                      <th className="px-2 py-2 text-right font-medium">{UI.estimations.listingColSurface}</th>
                      <th className="px-2 py-2 text-right font-medium">{UI.estimations.listingColPrixM2}</th>
                      <th className="px-2 py-2 font-medium">{UI.estimations.listingColActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {listings.map((item, i) => (
                      <tr key={item.id}>
                        <td className="relative w-10 px-2 py-2">
                          {item.photo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.photo_url}
                              alt={UI.estimations.listingPhotoAlt}
                              loading="lazy"
                              className="size-9 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="block size-9 rounded-lg bg-white/[0.06]" />
                          )}
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-200">
                          {item.titre.length > LISTING_TITLE_MAX_CHARS
                            ? item.titre.slice(0, LISTING_TITLE_MAX_CHARS) + "…"
                            : item.titre}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-200">{fmt.format(item.prix)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-200">{item.surface_m2}{UI.estimations.surfaceUnit}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-200">{fmt.format(item.prix_m2)}{UI.estimations.perSqmUnit}</td>
                        <td className="px-2 py-2">
                          {item.url ? (
                            <a
                              href={safeHref(item.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
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
