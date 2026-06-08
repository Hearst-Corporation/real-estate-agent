import Link from "next/link";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { countByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { eur, dateFr } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

/** Ordre canonique du cycle d'une estimation. */
const ESTIMATION_STATUSES = ["draft", "interviewing", "recap", "valuating", "ready", "archived"];
const IN_PROGRESS = ["draft", "interviewing", "recap", "valuating"];

type EstRow = {
  id: string;
  status: string;
  city: string | null;
  property_type: string | null;
  market_value: number | null;
  updated_at: string;
};

export default async function EstimationsPage() {
  const t = UI.estimations;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let estimations: EstRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("estimations")
      .select("id, status, city, property_type, market_value, updated_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    estimations = (data ?? []) as EstRow[];
  }

  const ready = estimations.filter((e) => e.status === "ready").length;
  const inProgress = estimations.filter((e) => IN_PROGRESS.includes(e.status)).length;
  const avgValue = average(estimations, "market_value");

  const pipeline = countByStatus(estimations, ESTIMATION_STATUSES, t.status, (s) =>
    statusTone("estimation", s)
  );
  const byType = topByCategory(estimations, "property_type");

  const columns: Column<EstRow>[] = [
    {
      key: "location",
      header: t.table.location,
      render: (e) => e.city ?? e.property_type ?? t.fallbackName,
    },
    { key: "type", header: t.table.type, render: (e) => e.property_type ?? "—" },
    { key: "value", header: t.table.value, align: "right", render: (e) => eur(e.market_value) },
    {
      key: "status",
      header: t.table.status,
      render: (e) => (
        <span className={`crm-status ${statusTone("estimation", e.status)}`}>
          {t.status[e.status] ?? e.status}
        </span>
      ),
    },
    { key: "updated", header: t.table.updated, align: "right", render: (e) => dateFr(e.updated_at) },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (e) => (
        <Link href={`/estimations/${e.id}`} className="ct-seg-btn">
          {e.status === "draft" || e.status === "interviewing" ? t.resume : t.open}
        </Link>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.portefeuille} />}
        action={
          <Link href="/estimations/new" className="ct-seg-btn primary">
            {t.newCta}
          </Link>
        }
        kpis={[
          { label: t.kpis.total, value: String(estimations.length) },
          { label: t.kpis.ready, value: String(ready) },
          { label: t.kpis.inProgress, value: String(inProgress) },
          { label: t.kpis.avgValue, value: eur(avgValue) },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.pipeline} variant="chart">
            <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.byType} variant="chart">
            <BarList items={byType} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
      </div>

      <Card variant="dense">
        <DataTable columns={columns} rows={estimations} emptyLabel={t.empty} getKey={(e) => e.id} />
      </Card>
    </PageStack>
  );
}
