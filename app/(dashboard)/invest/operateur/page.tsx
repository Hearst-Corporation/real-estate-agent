/**
 * BACK-OFFICE OPÉRATEUR — liste des deals de l'opérateur + statut. RSC.
 */
import Link from "next/link";
import { PageStack, PageHeader, KpiGrid, KpiCard, Sub } from "@/components/cockpit/primitives";
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
          <div className="inv-mk-toolbar inv-toolbar-end">
            <Link href="/invest/operateur/nouveau" className="inv-btn-reserve inv-link-inline">
              {o.newDealBtn}
            </Link>
          </div>

          <KpiGrid className="cols-4 inv-kpi-mb">
            <KpiCard label={o.kpis.total} value={String(deals.length)} />
            <KpiCard label={o.kpis.open} value={String(deals.filter((d) => d.status === "open").length)} accent />
            <KpiCard label={o.kpis.drafts} value={String(deals.filter((d) => d.status === "draft").length)} />
            <KpiCard label={o.kpis.targetSum} value={eur(deals.reduce((s, d) => s + d.targetRaiseEur, 0))} />
          </KpiGrid>

          {deals.length === 0 ? (
            <div className="inv-chart-card">
              <p className="inv-chart-foot">{o.emptyDeals}</p>
            </div>
          ) : (
            <div className="inv-chart-card">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>{o.table.deal}</th>
                    <th>{o.table.type}</th>
                    <th>{o.table.status}</th>
                    <th className="r">{o.table.raised}</th>
                    <th className="r">{o.table.tri}</th>
                    <th className="r">{o.table.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => {
                    const taux = d.targetRaiseEur > 0 ? Math.round((d.raisedEur / d.targetRaiseEur) * 100) : 0;
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/invest/${d.slug}`} className="inv-doc-name">
                            {d.name}
                          </Link>
                        </td>
                        <td>{d.dealType}</td>
                        <td>
                          <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill>
                        </td>
                        <td className="r">
                          {eur(d.raisedEur)} / {eur(d.targetRaiseEur)} ({taux}%)
                        </td>
                        <td className="r">
                          {pct(d.targetIrrPct != null ? d.targetIrrPct / 100 : null)}
                        </td>
                        <td className="r">
                          <Link href={`/invest/${d.slug}`}>{o.table.viewDeal}</Link>
                          {" · "}
                          <Link href={`/invest/operateur/${d.id}/closing`}>{o.table.closing}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="inv-fineprint inv-mt-lg">{o.fineprint}</p>
        </>
      )}
    </PageStack>
  );
}
