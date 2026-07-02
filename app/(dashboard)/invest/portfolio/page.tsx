/**
 * PORTEFEUILLE — suivi des positions (étude P12, écran 12). RSC, branché DB.
 */
import Link from "next/link";
import { PageStack, PageHeader, KpiGrid, KpiCard, Sub, Card } from "@/components/cockpit/primitives";
import { ProductBadges, StatusPill, Banner, Timeline, eur, pct } from "@/components/invest";
import type { StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { DEAL_BADGES_MAX } from "@/lib/invest/constants";
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
        badges: pos.deal.badges.slice(0, DEAL_BADGES_MAX),
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

      {isDemo && <Banner tone="info">{p.demoBanner}</Banner>}

      <KpiGrid>
        <KpiCard label={p.kpis.capitalLent} value={eur(capitalCumule)} />
        <KpiCard label={p.kpis.activePositions} value={String(actives)} />
        <KpiCard label={p.kpis.distributions} value={eur(distributionsCumulees)} />
      </KpiGrid>

      <Banner tone="warn">
        {p.antiConsolidatedBefore}
        <b>pas</b>
        {p.antiConsolidatedAfter}
      </Banner>

      {positions.map((pos) => (
        <Card key={pos.dealId}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-100">{pos.dealName}</span>
                <StatusPill tone={pos.statutTone}>{pos.statutLabel}</StatusPill>
              </div>
              <ProductBadges badges={pos.badges} />
              <div className="text-xs text-slate-500">
                {p.positionSummary(
                  eur(pos.capitalPreteEur),
                  pos.units,
                  pct(pos.triCible),
                  eur(pos.distributionsRecuesEur),
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-baseline gap-1.5 text-xs text-slate-400">
                <span>{p.ltvCurrent}</span>
                <b className="text-sm text-slate-100">{pos.ltv != null ? pct(pos.ltv) : UI.common.empty}</b>
              </div>
              <Link href={`/invest/${pos.dealSlug}`} className="text-sm text-indigo-300 hover:text-indigo-200">
                {p.viewDetail}
              </Link>
            </div>
          </div>
        </Card>
      ))}

      {payouts.length > 0 && (
        <Card title={p.payoutsTitle} titleAs="section">
          <div className="flex flex-col gap-2">
            {payouts.map((po) => (
              <div
                key={po.id}
                className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-b-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-slate-100">{po.dealName ?? p.payoutDefaultDeal}</span>
                  <span className="text-xs text-slate-500">
                    {p.distribTypes[po.distributionType ?? ""] ?? p.payoutDefaultType} ·{" "}
                    {p.payoutUnits(po.unitsHeld)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <b className="text-sm text-slate-100">{eur(po.netAmountEur)}</b>
                  <StatusPill tone={po.status === "paid" ? "funded" : po.status === "pending" ? "soon" : "late"}>
                    {p.payoutStatus[po.status] ?? po.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={p.exitsTitle} titleAs="section">
        <Timeline items={exits} />
      </Card>

      <p className="text-xs text-slate-500">{p.fineprint}</p>
    </PageStack>
  );
}
