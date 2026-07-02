/**
 * MARKETPLACE — découverte des opportunités (étude P5, écran 5). RSC.
 */
import { PageStack, PageHeader, Sub, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { DealCard, Banner, type DealCardData } from "@/components/invest";
import { eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { DEMO_DEALS } from "./_data/demo";
import { fetchOpenDeals, toDealCardData } from "./_data/server";

export const dynamic = "force-dynamic";

const m = UI.invest.marketplace;

export default async function MarketplacePage() {
  const { source, deals: dbDeals } = await fetchOpenDeals();
  const isDemo = source === "demo";

  const cards: DealCardData[] = isDemo
    ? DEMO_DEALS.map((d) => ({
        slug: d.slug,
        nom: d.input.nom,
        localisation: d.input.localisation,
        statusTone: d.statusTone,
        statusLabel: d.statusLabel,
        joursRestants: d.joursRestants,
        badges: d.badges,
        triCible: d.sheet.rendement_cible_irr,
        ltv: d.sheet.metrics.ltv,
        dureeMois: d.input.schedule.duree_mois,
        collecteEur: d.collecteEur,
        objectifEur: d.objectifEur,
      }))
    : dbDeals.map(toDealCardData);

  const dealsOuverts = cards.length;
  const collecteTotale = cards.reduce((s, d) => s + d.collecteEur, 0);
  const ticketMin = isDemo
    ? Math.min(...DEMO_DEALS.map((d) => d.input.ticket_min_eur ?? 1_000))
    : Math.min(...dbDeals.map((d) => d.minTicketEur), Infinity);
  const ticketMinAffiche = Number.isFinite(ticketMin) ? ticketMin : 1_000;

  return (
    <PageStack>
      <PageHeader kicker={m.eyebrow} title={m.title} meta={<Sub>{m.sub}</Sub>} />

      {isDemo ? <Banner tone="warn">{m.demoBanner}</Banner> : null}

      <Banner tone="info">{m.infoBanner}</Banner>

      <KpiGrid>
        <KpiCard label={m.kpis.openDeals} value={String(dealsOuverts)} />
        <KpiCard label={m.kpis.collected} value={eur(collecteTotale)} />
        <KpiCard label={m.kpis.medianTri} value={m.kpis.medianTriValue} accent />
        <KpiCard label={m.kpis.ticketFrom} value={eur(ticketMinAffiche)} />
      </KpiGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label={m.filtersAria}>
          {m.filters.map((f) => (
            <span
              key={f}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300"
            >
              {f}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label={m.sortAria}>
          {m.sorts.map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-3 py-1 text-xs ${
                i === 0
                  ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
                  : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((d) => (
          <DealCard key={d.slug} deal={d} />
        ))}
      </div>

      <p className="text-xs text-slate-500">{m.fineprint}</p>
    </PageStack>
  );
}
