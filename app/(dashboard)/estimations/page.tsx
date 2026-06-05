import Link from "next/link";
import { PageHeader, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { countByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { eur, dateFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

/** Ordre canonique du cycle d'une estimation. */
const ESTIMATION_STATUSES = ["draft", "interviewing", "recap", "valuating", "ready", "archived"];
const IN_PROGRESS = ["draft", "interviewing", "recap", "valuating"];

function estimationTone(status: string): "is-positive" | "is-negative" | "is-pending" {
  if (status === "ready") return "is-positive";
  if (status === "archived") return "is-negative";
  return "is-pending";
}

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
  let total = 0;

  if (claims && sb) {
    const { data, count } = await sb
      .from("estimations")
      .select("id, status, city, property_type, market_value, updated_at", {
        count: "exact",
      })
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    estimations = (data ?? []) as EstRow[];
    total = count ?? estimations.length;
  }

  const ready = estimations.filter((e) => e.status === "ready").length;
  const inProgress = estimations.filter((e) => IN_PROGRESS.includes(e.status)).length;
  // Moyenne sur les estimations PRÊTES uniquement (les autres n'ont pas de valeur).
  const avgValue = average(
    estimations.filter((e) => e.status === "ready"),
    "market_value"
  );

  const pipeline = countByStatus(estimations, ESTIMATION_STATUSES, t.status, estimationTone);
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
        <span className={`crm-status ${estimationTone(e.status)}`}>
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
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        sub={t.sub}
        actions={
          <Link href="/estimations/new" className="ct-seg-btn primary">
            {t.newCta}
          </Link>
        }
      />

      <KpiGrid>
        <KpiCard label={t.kpis.total} value={String(total)} accent />
        <KpiCard label={t.kpis.ready} value={String(ready)} />
        <KpiCard label={t.kpis.inProgress} value={String(inProgress)} />
        <KpiCard label={t.kpis.avgValue} value={eur(avgValue)} />
      </KpiGrid>

      <div className="ct-viz-row">
        <Card title={t.charts.pipeline}>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.byType}>
          <BarList items={byType} emptyLabel={UI.viz.empty} />
        </Card>
      </div>

      <Card>
        <DataTable columns={columns} rows={estimations} emptyLabel={t.empty} getKey={(e) => e.id} />
      </Card>
    </>
  );
}
