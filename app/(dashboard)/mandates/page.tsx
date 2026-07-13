import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { countByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { eur, dateFr, MANDATE_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import MandateFormModal from "./_components/MandateForm";

type MandateRow = {
  id: string;
  status: string;
  kind: string;
  reference: string | null;
  asking_price: number | null;
  commission_pct: number | null;
  expires_at: string | null;
  properties: { title: string | null; city: string | null } | null;
};

export default async function MandatesPage() {
  const t = UI.mandates;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let mandates: MandateRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("mandates")
      .select(
        "id, status, kind, reference, asking_price, commission_pct, expires_at, properties(title, city)",
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    mandates = (data ?? []) as MandateRow[];
  }

  const actifs = mandates.filter((m) => m.status === "actif");
  const underMandate = actifs.reduce((sum, m) => sum + (m.asking_price ?? 0), 0);
  const avgCommission = average(actifs, "commission_pct");

  const pipeline = countByStatus(mandates, MANDATE_STATUSES, t.statusLabels, (s) =>
    statusTone("mandate", s),
  );
  const byKind = topByCategory(mandates, "kind", t.kindLabels);

  const kpis = [
    { label: t.kpis.total, value: String(mandates.length) },
    { label: t.kpis.active, value: String(actifs.length) },
    { label: t.kpis.underMandate, value: eur(underMandate) },
    {
      label: t.kpis.avgCommission,
      value: avgCommission > 0 ? `${avgCommission}${t.commissionUnit}` : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Page heading — TW+ headings/03-with-meta-and-actions (thème clair) */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="@lg:flex @lg:items-center @lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500">
              {t.eyebrow}
            </p>
            <h1 className="font-titre text-2xl font-bold tracking-tight text-zinc-900 @sm:truncate @sm:text-3xl">
              {t.title}
            </h1>
          </div>
          <div className="mt-4 flex @lg:mt-0 @lg:ml-4">
            <MandateFormModal cta={t.newCta} />
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 border-b border-zinc-950/10 pb-2">
          <PageNavTabs tabs={TAB_GROUPS.portefeuille} />
        </nav>

        {/* KPI stats — TW+ data-display/stats (thème clair) */}
        <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="surface px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {kpi.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold text-zinc-900">{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Viz métier — cards TW+ layout/cards (thème clair) */}
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <section className="surface p-5">
          <div className="font-titre mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {t.charts.pipeline}
          </div>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="surface p-5">
          <div className="font-titre mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {t.charts.byKind}
          </div>
          <BarList items={byKind} emptyLabel={UI.viz.empty} />
        </section>
      </div>

      {/* Table — TW+ lists__tables/02-simple-in-card (thème clair) */}
      <div className="surface overflow-hidden">
        {mandates.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="text-sm font-semibold text-zinc-900">{t.empty}</h3>
          </div>
        ) : (
          <div className="px-2">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>{t.table.reference}</TableHeader>
                  <TableHeader className="text-right">{t.table.price}</TableHeader>
                  <TableHeader className="text-right">{t.table.commission}</TableHeader>
                  <TableHeader>{t.table.kind}</TableHeader>
                  <TableHeader className="text-right">{t.table.expires}</TableHeader>
                  <TableHeader>{t.table.status}</TableHeader>
                  <TableHeader className="text-right">{t.table.action}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {mandates.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-zinc-950 dark:text-white">
                      {m.reference ?? m.properties?.city ?? t.noReference}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{eur(m.asking_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.commission_pct != null ? `${m.commission_pct}${t.commissionUnit}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge>{t.kindLabels[m.kind] ?? m.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dateFr(m.expires_at)}
                    </TableCell>
                    <TableCell>
                      <StatusSelect
                        endpoint={`/api/mandates/${m.id}`}
                        value={m.status}
                        options={MANDATE_STATUSES}
                        labels={t.statusLabels}
                        ariaLabel={t.table.status}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteButton
                        endpoint={`/api/mandates/${m.id}`}
                        label={t.delete}
                        confirmMessage={t.delete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
