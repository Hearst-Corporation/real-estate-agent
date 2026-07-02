/**
 * PORTEFEUILLE — suivi des positions (étude P12, écran 12). RSC, branché DB.
 *
 * UI reconstruite sur blocs Tailwind Plus (adaptés au thème sombre, accent indigo) :
 *  - En-tête : application-ui/headings__page-headings/01-with-actions
 *  - KPI : application-ui/data-display__stats/03-simple-in-cards
 *  - Positions : application-ui/lists__grid-lists/03-simple-cards (une card par position)
 *  - Distributions : application-ui/lists__tables/02-simple-in-card
 *  - Sorties : timeline dans une card (headings + layout__cards)
 * La logique métier (fetch, mapping, agrégats) est inchangée.
 */
import Link from "next/link";
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

  const stats = [
    { name: p.kpis.capitalLent, value: eur(capitalCumule) },
    { name: p.kpis.activePositions, value: String(actives) },
    { name: p.kpis.distributions, value: eur(distributionsCumulees) },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* En-tête — page-headings/01-with-actions (adapté sombre) */}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
          {p.eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{p.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{p.sub}</p>
      </div>

      {isDemo && <Banner tone="info">{p.demoBanner}</Banner>}

      {/* KPI — stats/03-simple-in-cards (adapté sombre) */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 sm:p-6"
          >
            <dt className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.name}
            </dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <Banner tone="warn">
        {p.antiConsolidatedBefore}
        <b>pas</b>
        {p.antiConsolidatedAfter}
      </Banner>

      {/* Positions — grid-lists/03-simple-cards (une card par position, adapté sombre) */}
      <ul role="list" className="grid grid-cols-1 gap-5 @3xl:grid-cols-2">
        {positions.map((pos) => (
          <li
            key={pos.dealId}
            className="col-span-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20"
          >
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
                  <b className="text-sm text-slate-100">
                    {pos.ltv != null ? pct(pos.ltv) : UI.common.empty}
                  </b>
                </div>
                <Link
                  href={`/invest/${pos.dealSlug}`}
                  className="text-sm text-indigo-300 hover:text-indigo-200"
                >
                  {p.viewDetail}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Distributions — tables/02-simple-in-card (adapté sombre) */}
      {payouts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-100">{p.payoutsTitle}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th
                    scope="col"
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {p.payoutDefaultDeal}
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {p.payoutDefaultType}
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    €
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payouts.map((po) => (
                  <tr key={po.id}>
                    <td className="px-5 py-4 text-sm font-medium whitespace-nowrap text-slate-100">
                      {po.dealName ?? p.payoutDefaultDeal}
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-400">
                      {p.distribTypes[po.distributionType ?? ""] ?? p.payoutDefaultType} ·{" "}
                      {p.payoutUnits(po.unitsHeld)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-3">
                        <b className="text-sm text-slate-100">{eur(po.netAmountEur)}</b>
                        <StatusPill
                          tone={
                            po.status === "paid"
                              ? "funded"
                              : po.status === "pending"
                                ? "soon"
                                : "late"
                          }
                        >
                          {p.payoutStatus[po.status] ?? po.status}
                        </StatusPill>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sorties — timeline dans une card (layout__cards + headings) */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">{p.exitsTitle}</h2>
        <Timeline items={exits} />
      </div>

      <p className="text-xs text-slate-500">{p.fineprint}</p>
    </div>
  );
}
