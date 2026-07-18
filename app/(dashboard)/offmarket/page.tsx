/**
 * /offmarket — Matching off-market portefeuille ↔ acquéreurs.
 *
 * Server component : charge les biens du portefeuille de l'agent (owner-check
 * user+tenant, LIMIT). Le matching acquéreur et la création de sélection
 * partageable se font côté client via /api/offmarket (score RÉEL du moteur de
 * prospection, jamais inventé).
 */

import { PageHeader, PageStack, Card } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { OffmarketExplorer, type PortfolioProperty } from "./_components/OffmarketExplorer";

export const dynamic = "force-dynamic";

export default async function OffmarketPage() {
  const claims = await getSession();
  const sb = getGpu1Admin();

  let properties: PortfolioProperty[] = [];
  let dbUnavailable = false;

  if (claims && sb) {
    const { data, error } = await sb
      .from("properties")
      .select("id, title, property_type, city, surface, asking_price")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) dbUnavailable = true;
    properties = (data ?? []) as PortfolioProperty[];
  } else {
    dbUnavailable = true;
  }

  return (
    <PageStack>
      <PageHeader
        kicker="Off-market"
        title="Matching off-market"
        meta="Rapprochez vos biens du portefeuille des acquéreurs de votre base, puis partagez une sélection avec feedback."
      />
      {dbUnavailable ? (
        <Card>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Données indisponibles pour le moment. Réessayez plus tard.
          </p>
        </Card>
      ) : (
        <OffmarketExplorer properties={properties} />
      )}
    </PageStack>
  );
}
