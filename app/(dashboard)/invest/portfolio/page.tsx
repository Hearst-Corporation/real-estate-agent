/**
 * PORTEFEUILLE — suivi des positions (étude P12, écran 12). RSC, branché DB.
 */
import Link from "next/link";
import { PageStack, PageHeader, KpiGrid, KpiCard, Sub } from "@/components/cockpit/primitives";
import { ProductBadges, StatusPill, Banner, Timeline, eur, pct } from "@/components/invest";
import type { StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { DEMO_POSITIONS } from "../_data/demo";
import { fetchMyPortfolio, type PortfolioPositionView } from "../_data/server";

export const dynamic = "force-dynamic";

const p = UI.invest.portfolio;

export default async function PortfolioPage() {
  const portfolio = await fetchMyPortfolio();
  const isDemo = portfolio.source === "demo";

  const positions: PortfolioPositionView[] = isDemo
    ? DEMO_POSITIONS.map((pos) => ({
        dealId: pos.deal.slug,
        dealSlug: pos.deal.slug,
        dealName: pos.deal.input.nom,
        localisation: pos.deal.input.localisation,
        capitalPreteEur: pos.capitalPreteEur,
        units: pos.units,
        distributionsRecuesEur: pos.couponsRecusEur,
        triCible: pos.deal.sheet.rendement_cible_irr,
        ltv: pos.ltvActuelle,
        dureeMois: pos.deal.input.schedule.duree_mois,
        statutTone: pos.statutTone as StatusTone as PortfolioPositionView["statutTone"],
        statutLabel: pos.statutLabel,
        badges: pos.deal.badges.slice(0, 3),
      }))
    : portfolio.positions;

  const capitalCumule = positions.reduce((s, pos) => s + pos.capitalPreteEur, 0);
  const distributionsCumulees = positions.reduce((s, pos) => s + pos.distributionsRecuesEur, 0);
  const actives = positions.length;

  const exits = positions.map((pos) => ({
    title: pos.dealName,
    sub: p.exitSub(pos.dureeMois),
    state: "active" as const,
  }));

  const payouts = isDemo ? [] : portfolio.payouts;

  return (
    <PageStack>
      <PageHeader kicker={p.eyebrow} title={p.title} meta={<Sub>{p.sub}</Sub>} />

      {isDemo && (
        <div className="inv-mb-md">
          <Banner tone="info">{p.demoBanner}</Banner>
        </div>
      )}

      <KpiGrid className="cols-3">
        <KpiCard label={p.kpis.capitalLent} value={eur(capitalCumule)} />
        <KpiCard label={p.kpis.activePositions} value={String(actives)} />
        <KpiCard label={p.kpis.distributions} value={eur(distributionsCumulees)} />
      </KpiGrid>

      <div className="inv-mb-lg">
        <Banner tone="warn">
          {p.antiConsolidatedBefore}
          <b>pas</b>
          {p.antiConsolidatedAfter}
        </Banner>
      </div>

      {positions.map((pos) => (
        <div className="ct-card" key={pos.dealId}>
          <div className="inv-row-between">
            <div className="inv-portfolio-main">
              <div className="inv-row-center">
                <span className="inv-pf-deal-name">{pos.dealName}</span>
                <StatusPill tone={pos.statutTone}>{pos.statutLabel}</StatusPill>
              </div>
              <ProductBadges badges={pos.badges} />
              <div className="inv-fineprint">
                {p.positionSummary(
                  eur(pos.capitalPreteEur),
                  pos.units,
                  pct(pos.triCible),
                  eur(pos.distributionsRecuesEur),
                )}
              </div>
            </div>
            <div className="inv-portfolio-aside">
              <div className="inv-progress-meta">
                <span>{p.ltvCurrent}</span>
                <b>{pos.ltv != null ? pct(pos.ltv) : UI.common.empty}</b>
              </div>
              <Link href={`/invest/${pos.dealSlug}`} className="inv-doc-row inv-link-detail">
                {p.viewDetail}
              </Link>
            </div>
          </div>
        </div>
      ))}

      {payouts.length > 0 && (
        <div className="ct-card">
          <div className="ct-card-title">{p.payoutsTitle}</div>
          <div className="inv-stack-xs">
            {payouts.map((po) => (
              <div key={po.id} className="inv-doc-row inv-row-doc">
                <div className="inv-row-doc-meta">
                  <span className="inv-name-semibold">{po.dealName ?? p.payoutDefaultDeal}</span>
                  <span className="inv-fineprint">
                    {p.distribTypes[po.distributionType ?? ""] ?? p.payoutDefaultType} ·{" "}
                    {p.payoutUnits(po.unitsHeld)}
                  </span>
                </div>
                <div className="inv-row-doc-end">
                  <b>{eur(po.netAmountEur)}</b>
                  <StatusPill tone={po.status === "paid" ? "funded" : po.status === "pending" ? "soon" : "late"}>
                    {p.payoutStatus[po.status] ?? po.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ct-card">
        <div className="ct-card-title">{p.exitsTitle}</div>
        <Timeline items={exits} />
      </div>

      <p className="inv-fineprint inv-mt-md">{p.fineprint}</p>
    </PageStack>
  );
}
