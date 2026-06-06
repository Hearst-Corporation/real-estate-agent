import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { countByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { eur, dateFr, MANDATE_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
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

  const CRM_TABS = [
    { href: "/properties", label: UI.nav.properties },
    { href: "/leads", label: UI.nav.leads },
    { href: "/visits", label: UI.nav.visits },
    { href: "/mandates", label: UI.nav.mandates },
    { href: "/agenda", label: UI.nav.agenda },
  ];

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
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={CRM_TABS} />}
        action={<MandateFormModal cta={t.newCta} />}
        kpis={[
          { label: t.kpis.total, value: String(mandates.length) },
          { label: t.kpis.active, value: String(actifs.length) },
          { label: t.kpis.underMandate, value: eur(underMandate) },
          { label: t.kpis.avgCommission, value: avgCommission > 0 ? `${avgCommission}${t.commissionUnit}` : "—" },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.pipeline} variant="chart">
            <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.byKind} variant="chart">
            <BarList items={byKind} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
      </div>

      <Card variant="dense">
        <DataTable columns={columns} rows={mandates} emptyLabel={t.empty} getKey={(m) => m.id} />
      </Card>
    </PageStack>
  );
}
