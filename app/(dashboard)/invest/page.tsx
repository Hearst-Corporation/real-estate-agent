/**
 * MARKETPLACE — découverte des opportunités (étude P5, écran 5). RSC.
 */
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
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
    <div className="ct-page-area">
      <Eyebrow>{m.eyebrow}</Eyebrow>
      <Title>{m.title}</Title>
      <Sub>{m.sub}</Sub>

      {isDemo ? (
        <div className="inv-mb-md">
          <Banner tone="warn">{m.demoBanner}</Banner>
        </div>
      ) : null}

      <div className="inv-mb-lg">
        <Banner tone="info">{m.infoBanner}</Banner>
      </div>

      <div className="ct-kpi-grid cols-4">
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">{m.kpis.openDeals}</div>
          <div className="ct-kpi-value">{dealsOuverts}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">{m.kpis.collected}</div>
          <div className="ct-kpi-value">{eur(collecteTotale)}</div>
        </div>
        <div className="ct-kpi-card accent">
          <div className="ct-kpi-label">{m.kpis.medianTri}</div>
          <div className="ct-kpi-value">{m.kpis.medianTriValue}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">{m.kpis.ticketFrom}</div>
          <div className="ct-kpi-value">{eur(ticketMinAffiche)}</div>
        </div>
      </div>

      <div className="inv-mk-toolbar">
        <div className="inv-mk-filters" aria-label={m.filtersAria}>
          {m.filters.map((f) => (
            <span className="inv-chip" key={f}>
              {f}
            </span>
          ))}
        </div>
        <div className="inv-mk-filters" aria-label={m.sortAria}>
          {m.sorts.map((t, i) => (
            <span className={`inv-chip${i === 0 ? " active" : ""}`} key={t}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="inv-deal-grid">
        {cards.map((d) => (
          <DealCard key={d.slug} deal={d} />
        ))}
      </div>

      <p className="inv-fineprint inv-mt-lg">{m.fineprint}</p>
    </div>
  );
}
