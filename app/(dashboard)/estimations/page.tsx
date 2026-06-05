import Link from "next/link";
import { Eyebrow, Title, Sub, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export default async function EstimationsPage() {
  const t = UI.estimations;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let estimations: {
    id: string;
    status: string;
    city: string | null;
    property_type: string | null;
    market_value: number | null;
    updated_at: string;
  }[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("estimations")
      .select("id, status, city, property_type, market_value, updated_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    estimations = data ?? [];
  }

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>
      <Link href="/estimations/new" className="ct-seg-btn primary">
        {t.newCta}
      </Link>
      <div className="ct-mb-sm" />
      {estimations.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{t.empty}</p>
        </Card>
      ) : (
        estimations.map((est) => (
          <Card key={est.id}>
            <div className="est-list-row">
              <div className="est-list-info">
                <div className="est-list-main">
                  {est.city
                    ? est.city
                    : est.property_type
                    ? est.property_type
                    : t.fallbackName}
                  {est.property_type && est.city
                    ? ` — ${est.property_type}`
                    : ""}
                </div>
                <div className="est-list-meta">
                  <span className="ct-badge">
                    {t.status[est.status] ?? est.status}
                  </span>
                  {est.market_value ? (
                    <span className="ct-placeholder">
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                      }).format(est.market_value)}
                    </span>
                  ) : null}
                  <span className="ct-placeholder">
                    {new Date(est.updated_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
              <Link
                href={`/estimations/${est.id}`}
                className="ct-seg-btn"
              >
                {est.status === "draft" || est.status === "interviewing"
                  ? t.resume
                  : t.open}
              </Link>
            </div>
          </Card>
        ))
      )}
    </>
  );
}
