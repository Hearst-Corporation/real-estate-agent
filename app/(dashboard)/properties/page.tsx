import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { BarList } from "@/components/cockpit/BarList";
import { Donut } from "@/components/cockpit/Donut";
import { PropertiesViewToggle } from "./_components/PropertiesViewToggle";
import { barsByStatus, topByCategory, distributeByBand, autoBands, ratio } from "@/lib/crm/aggregate";
import { eur, PROPERTY_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { filterSeed } from "@/lib/crm/demo-filter";
import { TAB_GROUPS } from "@/config/nav";
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
  created_at?: string;
  updated_at?: string;
};

export default async function PropertiesPage() {
  const t = UI.properties;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: Property[] = [];
  let total = 0;

  if (claims && sb) {
    const { data, count } = await sb
      .from("properties")
      .select(
        `id, status, title, property_type, city, surface, asking_price, created_at, updated_at,
        property_photos!property_photos_property_id_fkey(url, is_cover, position)`,
        { count: "exact" }
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false })
      .limit(200);

    const rawProperties = (data ?? []) as unknown as Array<{
      id: string;
      status: string;
      title: string | null;
      property_type: string | null;
      city: string | null;
      surface: number | null;
      asking_price: number | null;
      created_at: string;
      updated_at: string;
      property_photos?: Array<{ url: string; is_cover: boolean; position: number }>;
    }>;

    properties = filterSeed(rawProperties, (p) => [p.title, p.city]).map((p) => ({
      id: p.id,
      status: p.status,
      title: p.title,
      property_type: p.property_type,
      city: p.city,
      surface: p.surface,
      asking_price: p.asking_price,
      created_at: p.created_at,
      updated_at: p.updated_at,
      cover_photo_url:
        p.property_photos?.find((ph) => ph.is_cover)?.url ??
        p.property_photos?.slice().sort((a, b) => a.position - b.position)[0]?.url ??
        null,
    }));
    total = count ?? properties.length;
  }

  const enVente = properties.filter((p) => p.status === "en_vente");
  const forSale = enVente.length;
  const sold = properties.filter((p) => p.status === "vendu").length;
  // Valeur portefeuille = somme des prix des biens EN VENTE (exclut vendus/archivés).
  const portfolio = enVente.reduce((sum, p) => sum + (p.asking_price ?? 0), 0);

  const pipeline = barsByStatus(properties, PROPERTY_STATUSES, t.statusLabels, (s) => statusTone("property", s));
  const byType = topByCategory(properties, "property_type", t.typeLabels);
  // Tranches calculées sur les prix réels du portefeuille (pas de bornes figées).
  const prices = properties.map((p) => p.asking_price);
  const byValueBand = distributeByBand(properties, "asking_price", autoBands(prices));
  const soldRate = ratio(properties, (p) => p.status === "vendu");

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.portefeuille} />}
        action={<PropertyFormModal />}
        kpis={[
          { label: t.kpis.total, value: String(total), icon: "properties" },
          { label: t.kpis.forSale, value: String(forSale), icon: "mandates" },
          { label: t.kpis.sold, value: String(sold), icon: "estimate" },
          { label: t.kpis.portfolio, value: eur(portfolio), icon: "home" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title={t.charts.pipeline} variant="chart">
          <BarList items={pipeline} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.soldRate} variant="chart">
          <Donut value={soldRate} sublabel={t.charts.soldRateSub} accent />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title={t.charts.byType} variant="chart">
          <BarList items={byType} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.byValueBand} variant="chart">
          <BarList items={byValueBand} emptyLabel={UI.viz.empty} />
        </Card>
      </div>

      <PropertiesViewToggle properties={properties} />
    </PageStack>
  );
}
