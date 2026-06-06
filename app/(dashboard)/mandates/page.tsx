import Link from "next/link";
import { PageHeader, Card, KpiGrid, KpiCard, Badge } from "@/components/cockpit/primitives";
import { BarList } from "@/components/cockpit/BarList";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { barsByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { statusTone } from "@/lib/crm/statusTone";
import { eur, dateFr, MANDATE_STATUSES } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

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
  let total = 0;

  if (claims && sb) {
    const { data, count } = await sb
      .from("mandates")
      .select(
        "id, status, kind, reference, asking_price, commission_pct, expires_at, properties(title, city)",
        { count: "exact" }
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    mandates = (data ?? []) as MandateRow[];
    total = count ?? mandates.length;
  }

  const actifs = mandates.filter((m) => m.status === "actif");
  const underMandate = actifs.reduce((sum, m) => sum + (m.asking_price ?? 0), 0);
  const avgCommission = average(actifs, "commission_pct");

  const pipeline = barsByStatus(mandates, MANDATE_STATUSES, t.statusLabels, (s) => statusTone("mandate", s));
  const byKind = topByCategory(mandates, "kind", t.kindLabels);

  const columns: Column<MandateRow>[] = [
    {
      key: "reference",
      header: t.table.reference,
      render: (m) => m.reference ?? m.properties?.city ?? t.noReference,
    },
    { key: "price", header: t.table.price, align: "right", render: (m) => eur(m.asking_price) },
    {
      key: "commission",
      header: t.table.commission,
      align: "right",
      render: (m) => (m.commission_pct != null ? `${m.commission_pct}${t.commissionUnit}` : "—"),
    },
    { key: "kind", header: t.table.kind, render: (m) => <Badge>{t.kindLabels[m.kind] ?? m.kind}</Badge> },
    { key: "expires", header: t.table.expires, align: "right", render: (m) => dateFr(m.expires_at) },
    {
      key: "status",
      header: t.table.status,
      render: (m) => (
        <StatusSelect
          endpoint={`/api/mandates/${m.id}`}
          value={m.status}
          options={MANDATE_STATUSES}
          labels={t.statusLabels}
          ariaLabel={t.table.status}
        />
      ),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (m) => <DeleteButton endpoint={`/api/mandates/${m.id}`} label={t.delete} confirmMessage={t.delete} />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        sub={t.sub}
        actions={
          <Link href="/mandates/new" className="ct-seg-btn primary">
            {t.newCta}
          </Link>
        }
      />

      <KpiGrid>
        <KpiCard label={t.kpis.total} value={String(total)} />
        <KpiCard label={t.kpis.active} value={String(actifs.length)} accent />
        <KpiCard label={t.kpis.underMandate} value={eur(underMandate)} />
        <KpiCard
          label={t.kpis.avgCommission}
          value={avgCommission > 0 ? `${avgCommission}${t.commissionUnit}` : "—"}
        />
      </KpiGrid>

      <div className="ct-viz-row">
        <Card title={t.charts.pipeline}>
          <BarList items={pipeline} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.byKind}>
          <BarList items={byKind} emptyLabel={UI.viz.empty} />
        </Card>
      </div>

      <Card title={t.title}>
        <DataTable columns={columns} rows={mandates} emptyLabel={t.empty} getKey={(m) => m.id} />
      </Card>
    </>
  );
}
