/**
 * BACK-OFFICE OPÉRATEUR — liste des deals de l'opérateur + statut. RSC.
 */
import Link from "next/link";
import { PageStack, PageHeader, KpiGrid, KpiCard, Card, Sub } from "@/components/cockpit/primitives";
import { Banner, StatusPill, eur, pct, type StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { fetchOperatorDeals } from "../_data/server";

function statusTone(status: string): StatusTone {
  switch (status) {
    case "open":
      return "open";
    case "draft":
      return "soon";
    case "funded":
    case "closing":
    case "live":
    case "distributing":
      return "open";
    case "cancelled":
    case "defaulted":
      return "late";
    default:
      return "closed";
  }
}

export const dynamic = "force-dynamic";

const o = UI.invest.operator;

export default async function OperateurPage() {
  const { authorized, configured, deals } = await fetchOperatorDeals();

  return (
    <PageStack>
      <PageHeader kicker={o.eyebrow} title={o.title} meta={<Sub>{o.sub}</Sub>} />

      {!configured ? (
        <Banner tone="warn">{o.dbUnavailable}</Banner>
      ) : !authorized ? (
        <Banner tone="warn">
          {o.unauthorizedBefore}
          <Link href="/invest">{o.opportunitiesLink}</Link>
          {o.unauthorizedAfter}
        </Banner>
      ) : (
        <>
          <div className="flex justify-end">
            <Link
              href="/invest/operateur/nouveau"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              {o.newDealBtn}
            </Link>
          </div>

          <KpiGrid>
            <KpiCard label={o.kpis.total} value={String(deals.length)} />
            <KpiCard label={o.kpis.open} value={String(deals.filter((d) => d.status === "open").length)} accent />
            <KpiCard label={o.kpis.drafts} value={String(deals.filter((d) => d.status === "draft").length)} />
            <KpiCard label={o.kpis.targetSum} value={eur(deals.reduce((s, d) => s + d.targetRaiseEur, 0))} />
          </KpiGrid>

          {deals.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">{o.emptyDeals}</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">{o.table.deal}</th>
                    <th className="px-5 py-3 font-medium">{o.table.type}</th>
                    <th className="px-5 py-3 font-medium">{o.table.status}</th>
                    <th className="px-5 py-3 text-right font-medium">{o.table.raised}</th>
                    <th className="px-5 py-3 text-right font-medium">{o.table.tri}</th>
                    <th className="px-5 py-3 text-right font-medium">{o.table.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {deals.map((d) => {
                    const taux = d.targetRaiseEur > 0 ? Math.round((d.raisedEur / d.targetRaiseEur) * 100) : 0;
                    return (
                      <tr key={d.id} className="text-slate-300">
                        <td className="px-5 py-3">
                          <Link href={`/invest/${d.slug}`} className="font-medium text-slate-100 hover:text-indigo-300">
                            {d.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3">{d.dealType}</td>
                        <td className="px-5 py-3">
                          <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {eur(d.raisedEur)} / {eur(d.targetRaiseEur)} ({taux}%)
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {pct(d.targetIrrPct != null ? d.targetIrrPct / 100 : null)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/invest/${d.slug}`} className="text-indigo-300 hover:text-indigo-200">
                            {o.table.viewDeal}
                          </Link>
                          {" · "}
                          <Link href={`/invest/operateur/${d.id}/closing`} className="text-indigo-300 hover:text-indigo-200">
                            {o.table.closing}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          <p className="mt-2 text-xs text-slate-500">{o.fineprint}</p>
        </>
      )}
    </PageStack>
  );
}
