import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { Donut } from "@/components/cockpit/Donut";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
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

  const columns: Column<VisitRow>[] = [
    {
      key: "property",
      header: t.table.property,
      render: (v) => v.properties?.title ?? v.properties?.city ?? v.property_id,
    },
    { key: "datetime", header: t.table.datetime, render: (v) => dateTimeFr(v.scheduled_at) },
    {
      key: "duration",
      header: t.table.duration,
      align: "right",
      render: (v) => `${v.duration_min}${t.durationUnit}`,
    },
    {
      key: "status",
      header: t.table.status,
      render: (v) => (
        <StatusSelect
          endpoint={`/api/visits/${v.id}`}
          value={v.status}
          options={VISIT_STATUSES}
          labels={t.statusLabels}
          ariaLabel={t.table.status}
        />
      ),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (v) => <DeleteButton endpoint={`/api/visits/${v.id}`} label={t.delete} confirmMessage={t.delete} />,
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.clients} />}
        action={<VisitForm cta={t.newCta} />}
        kpis={[
          { label: t.kpis.total, value: String(visits.length) },
          { label: t.kpis.upcoming, value: String(upcoming.length) },
          { label: t.kpis.done, value: String(done) },
          { label: t.kpis.noShow, value: `${noShowRate}%` },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.pipeline} variant="chart">
            <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.doneRate} variant="chart">
            <Donut value={doneRate} sublabel={t.charts.doneRateSub} accent />
          </Card>
        </div>
      </div>

      <Card variant="dense">
        {visits.length === 0 ? (
          <p className="ct-placeholder">{t.empty}</p>
        ) : (
          <DataTable columns={columns} rows={visits} emptyLabel={t.empty} getKey={(v) => v.id} />
        )}
      </Card>
    </PageStack>
  );
}
