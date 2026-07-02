import { Badge } from "@/components/cockpit/primitives";
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
      .select("id, status, kind, reference, asking_price, commission_pct, expires_at, properties(title, city)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    mandates = (data ?? []) as MandateRow[];
  }

  const actifs = mandates.filter((m) => m.status === "actif");
  const underMandate = actifs.reduce((sum, m) => sum + (m.asking_price ?? 0), 0);
  const avgCommission = average(actifs, "commission_pct");

  const pipeline = countByStatus(mandates, MANDATE_STATUSES, t.statusLabels, (s) =>
    statusTone("mandate", s)
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
      {/* Page heading — TW+ headings/03-with-meta-and-actions (thème sombre) */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="@lg:flex @lg:items-center @lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white @sm:truncate @sm:text-3xl">
              {t.title}
            </h1>
          </div>
          <div className="mt-4 flex @lg:mt-0 @lg:ml-4">
            <MandateFormModal cta={t.newCta} />
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
          <PageNavTabs tabs={TAB_GROUPS.portefeuille} />
        </nav>

        {/* KPI stats — TW+ data-display/stats (thème sombre) */}
        <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {kpi.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold text-white">{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Viz métier — cards TW+ layout/cards (thème sombre) */}
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {t.charts.pipeline}
          </div>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {t.charts.byKind}
          </div>
          <BarList items={byKind} emptyLabel={UI.viz.empty} />
        </section>
      </div>

      {/* Table — TW+ lists__tables/02-simple-in-card (thème sombre) */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        {mandates.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="text-sm font-semibold text-white">{t.empty}</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th scope="col" className="py-3 pr-3 pl-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.reference}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.price}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.commission}
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.kind}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.expires}
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.status}
                  </th>
                  <th scope="col" className="py-3 pr-6 pl-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.action}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mandates.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="py-4 pr-3 pl-6 text-sm font-medium whitespace-nowrap text-slate-100">
                      {m.reference ?? m.properties?.city ?? t.noReference}
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-slate-300 tabular-nums">
                      {eur(m.asking_price)}
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-slate-300 tabular-nums">
                      {m.commission_pct != null ? `${m.commission_pct}${t.commissionUnit}` : "—"}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap">
                      <Badge>{t.kindLabels[m.kind] ?? m.kind}</Badge>
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-slate-300 tabular-nums">
                      {dateFr(m.expires_at)}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap">
                      <StatusSelect
                        endpoint={`/api/mandates/${m.id}`}
                        value={m.status}
                        options={MANDATE_STATUSES}
                        labels={t.statusLabels}
                        ariaLabel={t.table.status}
                      />
                    </td>
                    <td className="py-4 pr-6 pl-3 text-right text-sm whitespace-nowrap">
                      <DeleteButton
                        endpoint={`/api/mandates/${m.id}`}
                        label={t.delete}
                        confirmMessage={t.delete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
