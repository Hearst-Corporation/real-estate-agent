import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import PropertiesList from "./_components/PropertiesList";
import PropertyFormModal from "./_components/PropertyForm";

export default async function PropertiesPage() {
  const t = UI.properties;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: {
    id: string;
    status: string;
    title: string | null;
    property_type: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    surface: number | null;
    rooms: number | null;
    bedrooms: number | null;
    asking_price: number | null;
    estimated_value: number | null;
    estimation_id: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("properties")
      .select(
        "id, status, title, property_type, address, city, postal_code, surface, rooms, bedrooms, asking_price, estimated_value, estimation_id, notes, created_at, updated_at"
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    properties = data ?? [];
  }

  const total = properties.length;
  const forSale = properties.filter((p) => p.status === "en_vente").length;
  const sold = properties.filter((p) => p.status === "vendu").length;
  const portfolio = properties.reduce((sum, p) => sum + (p.asking_price ?? 0), 0);

  const portfolioFormatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(portfolio);

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid className="cols-3">
        <KpiCard>
          <p className="ct-kpi-label">{t.kpis.total}</p>
          <p className="ct-kpi-value">{total}</p>
        </KpiCard>
        <KpiCard>
          <p className="ct-kpi-label">{t.kpis.forSale}</p>
          <p className="ct-kpi-value">{forSale}</p>
        </KpiCard>
        <KpiCard>
          <p className="ct-kpi-label">{t.kpis.sold}</p>
          <p className="ct-kpi-value">{sold}</p>
        </KpiCard>
        <KpiCard className="accent">
          <p className="ct-kpi-label">{t.kpis.portfolio}</p>
          <p className="ct-kpi-value">{portfolioFormatted}</p>
        </KpiCard>
      </KpiGrid>

      <div className="ct-mb-sm" />

      <PropertyFormModal />

      <div className="ct-mb-sm" />

      {properties.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{t.empty}</p>
        </Card>
      ) : (
        <PropertiesList properties={properties} statusLabels={t.statusLabels} openLabel={t.open} deleteLabel={t.delete} />
      )}
    </>
  );
}
