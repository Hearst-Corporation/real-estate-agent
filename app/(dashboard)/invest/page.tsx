/**
 * MARKETPLACE — découverte des opportunités (étude P5, écran 5). RSC.
 *
 * UI reconstruite sur blocs Tailwind Plus (adaptés au thème sombre, accent indigo) :
 *  - En-tête : application-ui/headings__page-headings/01-with-actions
 *  - KPI : application-ui/data-display__stats/03-simple-in-cards
 *  - Grille de deals : application-ui/lists__grid-lists/03-simple-cards (composée avec DealCard)
 * La logique métier (fetch, mapping, agrégats) est inchangée.
 */
import { DealCard, Banner, type DealCardData } from "@/components/invest";
import { eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
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

  const stats = [
    { name: m.kpis.openDeals, value: String(dealsOuverts), accent: false },
    { name: m.kpis.collected, value: eur(collecteTotale), accent: false },
    { name: m.kpis.medianTri, value: m.kpis.medianTriValue, accent: true },
    { name: m.kpis.ticketFrom, value: eur(ticketMinAffiche), accent: false },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* En-tête — page-headings/01-with-actions (adapté sombre) */}
      <div className="flex flex-col gap-1 @lg:flex-row @lg:items-start @lg:justify-between @lg:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-300">
            {m.eyebrow}
          </p>
          <Heading>{m.title}</Heading>
          <Text className="mt-1">{m.sub}</Text>
        </div>
      </div>

      {isDemo ? <Banner tone="warn">{m.demoBanner}</Banner> : null}
      <Banner tone="info">{m.infoBanner}</Banner>

      {/* KPI — stats/03-simple-in-cards (adapté sombre) */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 @2xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className={`overflow-hidden rounded-2xl border px-4 py-5 shadow-sm sm:p-6 ${
              item.accent
                ? "border-indigo-400/40 bg-indigo-500/10"
                : "border-zinc-950/10 bg-white dark:border-white/10 dark:bg-white/[0.03]"
            }`}
          >
            <dt className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
              {item.name}
            </dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Filtres / tris — conservés (chips), thème sombre */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label={m.filtersAria}>
          {m.filters.map((f) => (
            <span
              key={f}
              className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300"
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
                  ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-200"
                  : "border-zinc-950/10 bg-white text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Grille de deals — grid-lists/03-simple-cards (structure ul/li, DealCard en contenu) */}
      <ul
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 @4xl:grid-cols-3"
      >
        {cards.map((d) => (
          <li key={d.slug} className="col-span-1">
            <DealCard deal={d} />
          </li>
        ))}
      </ul>

      <Text>{m.fineprint}</Text>
    </div>
  );
}
