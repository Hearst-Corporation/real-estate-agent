import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { Donut } from "@/components/cockpit/Donut";
import { PropertiesViewToggle } from "./_components/PropertiesViewToggle";
import { countByStatus, topByCategory, distributeByBand, ratio } from "@/lib/crm/aggregate";
import { eur, PROPERTY_STATUSES } from "@/lib/crm/format";
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
  cover_photo_url?: string | null;
};

export default async function PropertiesPage() {
  const t = UI.properties;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: Property[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("properties")
      .select(
        `id, status, title, property_type, city, surface, asking_price,
        property_photos!property_photos_property_id_fkey(url, is_cover, position)`
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });

    const rawProperties = (data ?? []) as unknown as Array<{
      id: string;
      status: string;
      title: string | null;
      property_type: string | null;
      city: string | null;
      surface: number | null;
      asking_price: number | null;
      property_photos?: Array<{ url: string; is_cover: boolean; position: number }>;
    }>;

    properties = rawProperties.map((p) => ({
      id: p.id,
      status: p.status,
      title: p.title,
      property_type: p.property_type,
      city: p.city,
      surface: p.surface,
      asking_price: p.asking_price,
      cover_photo_url:
        p.property_photos?.find((ph) => ph.is_cover)?.url ??
        p.property_photos?.slice().sort((a, b) => a.position - b.position)[0]?.url ??
        null,
    }));
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

  const CRM_TABS = [
    { href: "/properties", label: UI.nav.properties },
    { href: "/leads", label: UI.nav.leads },
    { href: "/visits", label: UI.nav.visits },
    { href: "/mandates", label: UI.nav.mandates },
    { href: "/agenda", label: UI.nav.agenda },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={CRM_TABS} />}
        action={<PropertyFormModal />}
        kpis={[
          { label: t.kpis.total, value: String(total) },
          { label: t.kpis.forSale, value: String(forSale) },
          { label: t.kpis.sold, value: String(sold) },
          { label: t.kpis.portfolio, value: eur(portfolio) },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.pipeline} variant="chart">
            <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.soldRate} variant="chart">
            <Donut value={soldRate} sublabel={t.charts.soldRateSub} accent />
          </Card>
        </div>
      </div>

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.byType} variant="chart">
            <BarList items={byType} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.byValueBand} variant="chart">
            <BarList items={byValueBand} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
      </div>

      <PropertiesViewToggle properties={properties} />
    </PageStack>
  );
}
