/**
 * BACK-OFFICE OPÉRATEUR — liste des deals de l'opérateur + statut. RSC.
 */
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/20/solid";
import { PageStack } from "@/components/cockpit/primitives";
import { Banner, StatusPill, eur, pct, type StatusTone } from "@/components/invest";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
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

  const stats = [
    { name: o.kpis.total, value: String(deals.length), accent: false },
    { name: o.kpis.open, value: String(deals.filter((d) => d.status === "open").length), accent: true },
    { name: o.kpis.drafts, value: String(deals.filter((d) => d.status === "draft").length), accent: false },
    { name: o.kpis.targetSum, value: eur(deals.reduce((s, d) => s + d.targetRaiseEur, 0)), accent: false },
  ];

  return (
    <PageStack>
      {/* Page heading — TW+ headings__page-headings/03-with-meta-and-actions (adapté sombre) */}
      <div className="lg:flex lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">{o.eyebrow}</p>
          <Heading className="mt-1">{o.title}</Heading>
          <Text className="mt-2 max-w-2xl">{o.sub}</Text>
        </div>
        {configured && authorized ? (
          <div className="mt-5 flex lg:mt-0 lg:ml-4">
            <Button href="/invest/operateur/nouveau" color="indigo">
              <PlusIcon data-slot="icon" />
              {o.newDealBtn}
            </Button>
          </div>
        ) : null}
      </div>

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
          {/* Stats — TW+ data-display__stats/01-with-trending (adapté sombre, sans trending) */}
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.name}
                className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-6 sm:px-6 ${
                  stat.accent ? "bg-indigo-500/10" : "bg-white/[0.03]"
                }`}
              >
                <dt className="text-sm font-medium text-slate-400">{stat.name}</dt>
                <dd className="w-full flex-none text-3xl font-medium tracking-tight text-white">{stat.value}</dd>
              </div>
            ))}
          </dl>

          {deals.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
              <p className="text-sm text-slate-500">{o.emptyDeals}</p>
            </div>
          ) : (
            /* Table — primitives Catalyst dans une carte */
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 shadow-lg shadow-black/20 backdrop-blur-sm">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{o.table.deal}</TableHeader>
                    <TableHeader>{o.table.type}</TableHeader>
                    <TableHeader>{o.table.status}</TableHeader>
                    <TableHeader className="text-right">{o.table.raised}</TableHeader>
                    <TableHeader className="text-right">{o.table.tri}</TableHeader>
                    <TableHeader className="text-right">{o.table.action}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deals.map((d) => {
                    const taux = d.targetRaiseEur > 0 ? Math.round((d.raisedEur / d.targetRaiseEur) * 100) : 0;
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link href={`/invest/${d.slug}`} className="font-medium text-slate-100 hover:text-indigo-300">
                            {d.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-slate-400">{d.dealType}</TableCell>
                        <TableCell>
                          <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-400">
                          {eur(d.raisedEur)} / {eur(d.targetRaiseEur)} ({taux}%)
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-400">
                          {pct(d.targetIrrPct != null ? d.targetIrrPct / 100 : null)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/invest/${d.slug}`} className="font-medium text-indigo-300 hover:text-indigo-200">
                            {o.table.viewDeal}
                          </Link>
                          {" · "}
                          <Link href={`/invest/operateur/${d.id}/closing`} className="font-medium text-indigo-300 hover:text-indigo-200">
                            {o.table.closing}
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500">{o.fineprint}</p>
        </>
      )}
    </PageStack>
  );
}
