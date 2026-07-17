"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/table";
import { UI } from "@/lib/ui-strings";
import { RECAP_FIELDS } from "@/lib/estimation/spec";
import { buildStaticMap } from "@/lib/estimation/staticmap";
import type { Coverage } from "@/lib/estimation/spec";
import type { Valuation, MarketAnalysis, ListingsFetchSource, PropertyData, FieldStatusMap, DvfComparable } from "@/lib/estimation/types";

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

const dvfDateFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "2-digit",
  year: "numeric",
});

/** Date de mutation DVF → « MM/AAAA » (fallback : brut si non parsable). */
function dvfDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dvfDateFmt.format(d);
}

const LISTING_TITLE_MAX_CHARS = 40;
const DVF_ROWS_MAX = 8;

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
  const [ficheOpen, setFicheOpen] = useState(false);

  const dvfComparables: DvfComparable[] = (marketProp?.dvf_comparables ?? []).slice(
    0,
    DVF_ROWS_MAX
  );
  // Défensif : `adjustments` peut manquer sur d'anciennes valorisations stockées.
  const adjustments = valuation.adjustments ?? [];
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
      <div className="surface col-span-full p-4">
        <Button
          plain
          className="w-full justify-between !text-sm !font-semibold"
          onClick={() => setFicheOpen((v) => !v)}
          aria-expanded={ficheOpen}
        >
          <span>{UI.estimations.ficheTitle}</span>
          <span className="font-mono text-xs tracking-widest text-accent-600">
            {"●".repeat(Math.min(coverage.collected, coverage.total))}
            {"○".repeat(Math.max(0, coverage.total - coverage.collected))}
          </span>
          <span className="text-xs text-zinc-500">{ficheOpen ? "▲" : "▼"}</span>
        </Button>
        {ficheOpen && (
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 @lg:grid-cols-2">
            {filledFields.length === 0 ? (
              <Text className="py-4">{UI.estimations.ficheEmpty}</Text>
            ) : (
              filledFields.map(({ field, label }) => {
                const formatted = formatValue(property[field]);
                const toConfirm = fieldStatus[field] === "to_confirm";
                return (
                  <div key={field} className="flex items-baseline justify-between gap-2 border-b border-zinc-950/5 py-1.5 text-sm">
                    <span className="text-zinc-500">{label}</span>
                    <span className="flex items-center gap-1.5 text-right text-zinc-950">
                      {formatted}
                      {toConfirm && (
                        <Badge color="amber">{UI.estimations.toConfirm}</Badge>
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
      {adjustments.length > 0 && (
        <div className="surface p-4">
          <Subheading className="font-titre">{UI.estimations.adjustmentsTitle}</Subheading>
          <ul className="mt-3 flex flex-col gap-3">
            {adjustments.map((adj, i) => (
              <li key={i} className="flex items-start gap-3">
                <Badge color={adj.type === "premium" ? "lime" : "red"} className="shrink-0 tabular-nums">
                  {adj.type === "premium" ? UI.estimations.premiumSign : UI.estimations.discountSign}
                  {Math.abs(adj.pct)}%
                </Badge>
                <span className="text-sm">
                  <strong className="font-semibold text-zinc-950">{adj.label}</strong>
                  {adj.rationale && (
                    <span className="text-zinc-500">
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
      <div className="surface p-4">
        <Subheading className="font-titre">{UI.estimations.marketContextTitle}</Subheading>
        <div className="mt-3">
          {!marketLoaded && (
            <>
              <Text>{UI.estimations.marketContextHint}</Text>
              <Button outline className="mt-2" onClick={handleMarketContext} disabled={marketLoading}>
                {marketLoading ? UI.estimations.marketContextLoading : UI.estimations.marketContextCta}
              </Button>
            </>
          )}
          {marketLoaded && !marketHasContent && (
            <Text>{UI.estimations.marketContextEmpty}</Text>
          )}
          {marketLoaded && marketHasContent && market && (
            <>
              {market.summary && <p className="text-sm leading-relaxed text-zinc-700">{market.summary}</p>}
              {market.citations.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {market.citations.map((c, i) => (
                    <li key={i}>
                      <a
                        href={safeHref(c.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-accent-600 hover:text-accent-500"
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

      {/* ── Ventes réelles comparables (DVF) — socle du calcul ── */}
      {marketProp != null && (
        <div className="surface col-span-full p-4">
          <Subheading className="font-titre">{UI.estimations.dvfTitle}</Subheading>
          <Text className="mt-1 !text-xs">{UI.estimations.dvfSubtitle}</Text>
          <div className="mt-3">
            {dvfComparables.length === 0 ? (
              <Text className="py-4">{UI.estimations.dvfEmpty}</Text>
            ) : (
              <>
                <Table dense>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{UI.estimations.dvfColDate}</TableHeader>
                      <TableHeader>{UI.estimations.dvfColType}</TableHeader>
                      <TableHeader className="text-right">{UI.estimations.dvfColSurface}</TableHeader>
                      <TableHeader className="text-right">{UI.estimations.dvfColPrice}</TableHeader>
                      <TableHeader className="text-right">{UI.estimations.dvfColPerM2}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dvfComparables.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="tabular-nums text-zinc-500">{dvfDate(c.date_mutation)}</TableCell>
                        <TableCell className="text-zinc-700">
                          {c.nombre_pieces != null ? UI.estimations.dvfPieces(c.nombre_pieces) : c.type_local}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-700">
                          {c.surface_reelle_bati != null ? `${c.surface_reelle_bati}${UI.estimations.surfaceUnit}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-700">{fmt.format(c.valeur_fonciere)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-zinc-950">{fmt.format(c.prix_m2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {marketProp.nb_transactions_12m > 0 && (
                  <p className="mt-3 text-xs text-zinc-500">
                    {UI.estimations.dvfSourceNote(marketProp.nb_transactions_12m)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Annonces comparables ── */}
      {marketProp != null && (
        <div className="surface col-span-full p-4">
          <Subheading className="font-titre">{UI.estimations.listingComparablesTitle}</Subheading>
          <div className="mt-3">
            {listings.length > 0 && listingFetchSource != null && listingFetchSource !== "none" && (
              <p className="mb-3 text-xs text-zinc-500">
                {UI.estimations.listingFetchSourcePrefix}{" "}
                <strong className="font-semibold text-zinc-700">
                  {listingFallbackUsed
                    ? UI.estimations.listingFetchSourceLabels["myswarms"]
                    : (UI.estimations.listingFetchSourceLabels[listingFetchSource] ?? listingFetchSource)}
                </strong>
              </p>
            )}
            {sectorMap && (
              <figure
                className="relative mb-4 overflow-hidden rounded-xl border border-zinc-950/10"
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
                    className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-white shadow"
                    style={{ left: m.left, top: m.top }}
                  >
                    {i + 1}
                  </span>
                ))}
                {sectorMap.subject && (
                  <span
                    className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-400 bg-white shadow"
                    style={{ left: sectorMap.subject.left, top: sectorMap.subject.top }}
                  />
                )}
                <figcaption className="absolute bottom-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {UI.estimations.sectorMapAttribution}
                </figcaption>
              </figure>
            )}
            {listings.length === 0 ? (
              <Text className="py-4">{UI.estimations.listingComparablesEmpty}</Text>
            ) : (
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <span className="sr-only">{UI.estimations.listingPhotoAlt}</span>
                    </TableHeader>
                    <TableHeader>{UI.estimations.listingColAnnonce}</TableHeader>
                    <TableHeader className="text-right">{UI.estimations.listingColPrix}</TableHeader>
                    <TableHeader className="text-right">{UI.estimations.listingColSurface}</TableHeader>
                    <TableHeader className="text-right">{UI.estimations.listingColPrixM2}</TableHeader>
                    <TableHeader>{UI.estimations.listingColActions}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listings.map((item, i) => (
                    <TableRow key={item.id}>
                      <TableCell className="relative w-10">
                        {item.photo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={item.photo_url}
                            alt={UI.estimations.listingPhotoAlt}
                            loading="lazy"
                            className="size-9 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="block size-9 rounded-lg bg-zinc-950/5" />
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-accent-500 text-[9px] font-bold text-white">
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="text-zinc-700">
                        {item.titre.length > LISTING_TITLE_MAX_CHARS
                          ? item.titre.slice(0, LISTING_TITLE_MAX_CHARS) + "…"
                          : item.titre}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-700">{fmt.format(item.prix)}</TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-700">{item.surface_m2}{UI.estimations.surfaceUnit}</TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-700">{fmt.format(item.prix_m2)}{UI.estimations.perSqmUnit}</TableCell>
                      <TableCell>
                        {item.url ? (
                          <a
                            href={safeHref(item.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-accent-600 hover:text-accent-500"
                          >
                            {UI.estimations.listingComparablesLink}
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
