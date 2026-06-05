import Link from "next/link";
import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { Donut } from "@/components/cockpit/Donut";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { countByStatus, topByCategory, distributeByBand, ratio } from "@/lib/crm/aggregate";
import { eur, sqm, PROPERTY_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import PropertyFormModal from "./_components/PropertyForm";

type Property = {
  id: string;
  status: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  surface: number | null;
  asking_price: number | null;
};

export default async function PropertiesPage() {
  const t = UI.properties;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: Property[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("properties")
      .select("id, status, title, property_type, city, surface, asking_price")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    properties = (data ?? []) as Property[];
  }

  const total = properties.length;
  const forSale = properties.filter((p) => p.status === "en_vente").length;
  const sold = properties.filter((p) => p.status === "vendu").length;
  const portfolio = properties.reduce((sum, p) => sum + (p.asking_price ?? 0), 0);

  const pipeline = countByStatus(properties, PROPERTY_STATUSES, t.statusLabels, (s) =>
    statusTone("property", s)
  );
  const byType = topByCategory(properties, "property_type", t.typeLabels);
  const byValueBand = distributeByBand(properties, "asking_price");
  const soldRate = ratio(properties, (p) => p.status === "vendu");

  const columns: Column<Property>[] = [
    {
      key: "title",
      header: t.table.title,
      render: (p) => (
        <Link href={`/properties/${p.id}`} className="crm-link">
          {p.title ?? t.fallbackTitle}
        </Link>
      ),
    },
    { key: "type", header: t.table.type, render: (p) => t.typeLabels[p.property_type ?? ""] ?? p.property_type ?? "—" },
    { key: "city", header: t.table.city, render: (p) => p.city ?? "—" },
    { key: "surface", header: t.table.surface, align: "right", render: (p) => sqm(p.surface) },
    { key: "price", header: t.table.price, align: "right", render: (p) => eur(p.asking_price) },
    {
      key: "status",
      header: t.table.status,
      render: (p) => (
        <span className={`crm-status ${statusTone("property", p.status)}`}>
          {t.statusLabels[p.status] ?? p.status}
        </span>
      ),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (p) => (
        <div className="ct-table-actions">
          <Link href={`/properties/${p.id}`} className="ct-seg-btn">
            {t.open}
          </Link>
          <DeleteButton endpoint={`/api/properties/${p.id}`} label={t.delete} confirmMessage={t.delete} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid>
        <KpiCard label={t.kpis.total} value={String(total)} accent />
        <KpiCard label={t.kpis.forSale} value={String(forSale)} />
        <KpiCard label={t.kpis.sold} value={String(sold)} />
        <KpiCard label={t.kpis.portfolio} value={eur(portfolio)} />
      </KpiGrid>

      <div className="ct-viz-row">
        <Card title={t.charts.pipeline}>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.soldRate}>
          <Donut value={soldRate} sublabel={t.charts.soldRateSub} accent />
        </Card>
      </div>

      <div className="ct-viz-row even">
        <Card title={t.charts.byType}>
          <BarList items={byType} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.byValueBand}>
          <BarList items={byValueBand} emptyLabel={UI.viz.empty} />
        </Card>
      </div>

      <div className="crm-toolbar">
        <span className="ct-card-title">{t.title}</span>
        <PropertyFormModal />
      </div>

      <Card>
        <DataTable columns={columns} rows={properties} emptyLabel={t.empty} getKey={(p) => p.id} />
      </Card>
    </>
  );
}
