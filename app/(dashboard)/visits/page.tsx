import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { Donut } from "@/components/cockpit/Donut";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { countByStatus, ratio } from "@/lib/crm/aggregate";
import { dateTimeFr, VISIT_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import VisitForm from "./_components/VisitForm";

type VisitRow = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_min: number;
  property_id: string;
  properties: { title: string | null; city: string | null } | null;
};

export default async function VisitsPage() {
  const t = UI.visits;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let visits: VisitRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("visits")
      .select("id, status, scheduled_at, duration_min, property_id, properties(title, city)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("scheduled_at", { ascending: true });
    visits = (data ?? []) as VisitRow[];
  }

  const now = new Date();
  const upcoming = visits.filter((v) => new Date(v.scheduled_at) >= now);
  const done = visits.filter((v) => v.status === "realisee").length;
  const noShow = visits.filter((v) => v.status === "no_show").length;
  const noShowRate = visits.length > 0 ? Math.round((noShow / visits.length) * 100) : 0;

  const pipeline = countByStatus(visits, VISIT_STATUSES, t.statusLabels, (s) =>
    statusTone("visit", s)
  );
  const doneRate = ratio(visits, (v) => v.status === "realisee");

  const stats = [
    { name: t.kpis.total, value: String(visits.length) },
    { name: t.kpis.upcoming, value: String(upcoming.length) },
    { name: t.kpis.done, value: String(done) },
    { name: t.kpis.noShow, value: `${noShowRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header — headings__page-headings/01-with-actions (dark) */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl">
              {t.title}
            </h1>
          </div>
          <div className="mt-4 flex shrink-0 md:mt-0 md:ml-4">
            <VisitForm cta={t.newCta} />
          </div>
        </div>
        <nav aria-label="Tabs" className="-mb-px flex flex-wrap items-center gap-1">
          <PageNavTabs tabs={TAB_GROUPS.clients} />
        </nav>
      </div>

      {/* KPI — data-display__stats/03-simple-in-cards (dark) */}
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* Charts — conteneur bloc card (dark), viz métier conservée */}
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-base font-semibold text-white">{t.charts.pipeline}</h2>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-base font-semibold text-white">{t.charts.doneRate}</h2>
          <Donut value={doneRate} sublabel={t.charts.doneRateSub} accent />
        </section>
      </div>

      {/* Table — lists__tables/02-simple-in-card (dark) */}
      {visits.length === 0 ? (
        /* Empty state — feedback__empty-states/01-simple (dark) */
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
          <CalendarDaysIcon aria-hidden="true" className="mx-auto size-12 text-slate-500" />
          <h3 className="mt-2 text-sm font-semibold text-white">{t.empty}</h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="py-3.5 pr-3 pl-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {t.table.property}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {t.table.datetime}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {t.table.duration}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {t.table.status}
                  </th>
                  <th scope="col" className="py-3.5 pr-6 pl-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.table.action}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visits.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="py-4 pr-3 pl-6 text-sm font-medium text-white">
                      {v.properties?.title ?? v.properties?.city ?? v.property_id}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap text-slate-400">
                      {dateTimeFr(v.scheduled_at)}
                    </td>
                    <td className="px-3 py-4 text-right text-sm tabular-nums whitespace-nowrap text-slate-300">
                      {`${v.duration_min}${t.durationUnit}`}
                    </td>
                    <td className="px-3 py-4 text-sm text-slate-300">
                      <StatusSelect
                        endpoint={`/api/visits/${v.id}`}
                        value={v.status}
                        options={VISIT_STATUSES}
                        labels={t.statusLabels}
                        ariaLabel={t.table.status}
                      />
                    </td>
                    <td className="py-4 pr-6 pl-3 text-right text-sm">
                      <DeleteButton endpoint={`/api/visits/${v.id}`} label={t.delete} confirmMessage={t.delete} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
