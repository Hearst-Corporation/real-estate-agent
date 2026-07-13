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
import { ProductBadges, StatusPill, Banner, Timeline, eur, pct } from "@/components/invest";
import type { StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text, TextLink } from "@/components/ui/text";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
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
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-300">
          {p.eyebrow}
        </p>
        <Heading>{p.title}</Heading>
        <Text className="mt-1">{p.sub}</Text>
      </div>

      {isDemo && <Banner tone="info">{p.demoBanner}</Banner>}

      {/* KPI — stats/03-simple-in-cards (adapté sombre) */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white px-4 py-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/[0.03]"
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
            className="col-span-1 flex flex-col gap-3 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-zinc-950 dark:text-white">{pos.dealName}</span>
                  <StatusPill tone={pos.statutTone}>{pos.statutLabel}</StatusPill>
                </div>
                <ProductBadges badges={pos.badges} />
                <Text>
                  {p.positionSummary(
                    eur(pos.capitalPreteEur),
                    pos.units,
                    pct(pos.triCible),
                    eur(pos.distributionsRecuesEur),
                  )}
                </Text>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-baseline gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{p.ltvCurrent}</span>
                  <b className="text-sm text-zinc-950 dark:text-white">
                    {pos.ltv != null ? pct(pos.ltv) : UI.common.empty}
                  </b>
                </div>
                <TextLink href={`/invest/${pos.dealSlug}`}>{p.viewDetail}</TextLink>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Distributions — tables/02-simple-in-card (adapté sombre) */}
      {payouts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="border-b border-zinc-950/10 px-5 py-4 dark:border-white/10">
            <Subheading>{p.payoutsTitle}</Subheading>
          </div>
          <div className="px-5">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{p.payoutDefaultDeal}</TableHeader>
                  <TableHeader>{p.payoutDefaultType}</TableHeader>
                  <TableHeader className="text-right">€</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {payouts.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium text-zinc-950 dark:text-white">
                      {po.dealName ?? p.payoutDefaultDeal}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {p.distribTypes[po.distributionType ?? ""] ?? p.payoutDefaultType} ·{" "}
                      {p.payoutUnits(po.unitsHeld)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <b className="text-zinc-950 dark:text-white">{eur(po.netAmountEur)}</b>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sorties — timeline dans une card (layout__cards + headings) */}
      <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <Subheading className="mb-3">{p.exitsTitle}</Subheading>
        <Timeline items={exits} />
      </div>

      <Text>{p.fineprint}</Text>
    </div>
  );
}
