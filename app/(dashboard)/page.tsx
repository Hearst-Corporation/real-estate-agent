import Link from "next/link";
import {
  KpiGrid,
  KpiCard,
  Card,
  HeroMetric,
  PageStack,
} from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { dateFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

/** Nombre de biens récents affichés dans le cockpit. */
const RECENT_PROPERTIES_LIMIT = 6;

/** Statuts leads considérés comme "terminés" (exclus du count actifs). */
const LEADS_CLOSED = ["gagne", "perdu"];

type PropertyRow = {
  id: string;
  title: string | null;
  status: string;
  city: string | null;
  property_type: string | null;
  updated_at: string;
};

export default async function DashboardPage() {
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: PropertyRow[] = [];
  let nbLeadsActifs = 0;
  let nbVisitesAVenir = 0;
  let nbMandatsActifs = 0;
  let nbBiensEnVente = 0;
  let nbProperties = 0;

  if (claims && sb) {
    const uid = claims.sub;
    const tid = tenantOf(claims);
    const now = new Date().toISOString();

    const [
      propertiesRes,
      propertiesTotalRes,
      propertiesForSaleRes,
      leadsRes,
      visitsCountRes,
      mandatesRes,
    ] = await Promise.all([
      sb
        .from("properties")
        .select("id, title, status, city, property_type, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: false })
        .limit(RECENT_PROPERTIES_LIMIT),

      sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid),

      sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "en_vente"),

      sb
        .from("leads")
        .select("id, status", { count: "exact" })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("status", "in", `(${LEADS_CLOSED.join(",")})`),

      sb
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", now),

      sb
        .from("mandates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "actif"),
    ]);

    properties = (propertiesRes.data ?? []) as PropertyRow[];
    nbProperties = propertiesTotalRes.count ?? 0;
    nbBiensEnVente = propertiesForSaleRes.count ?? 0;
    nbLeadsActifs = leadsRes.count ?? (leadsRes.data?.length ?? 0);
    nbVisitesAVenir = visitsCountRes.count ?? 0;
    nbMandatsActifs = mandatesRes.count ?? 0;
  }

  const recentColumns: Column<PropertyRow>[] = [
    {
      key: "property",
      header: "Bien",
      render: (r) => (
        <Link href={`/properties/${r.id}`} className="crm-link">
          {r.title ?? r.city ?? "Bien sans titre"}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (r) => r.status,
    },
    { key: "type", header: "Type", render: (r) => r.property_type ?? "—" },
    { key: "city", header: "Ville", render: (r) => r.city ?? "—" },
    {
      key: "updated",
      header: "Maj",
      align: "right",
      render: (r) => dateFr(r.updated_at),
    },
  ];

  return (
    <PageStack>
      <div className="ct-viz-row">
        <div>
          <Card variant="chart">
            <HeroMetric
              eyebrow="Cockpit agence"
              value={String(nbProperties)}
              label="biens suivis dans le portefeuille"
            >
              <div className="ct-hero-visual">
                <hearst-asset
                  id="viz:holo-rings"
                  catalog-base="/cockpit-catalog/catalog/"
                  aria-label="Visualisation cockpit agence"
                />
              </div>
            </HeroMetric>
            <div className="ct-mb-sm" />
            <div className="ct-card-title">Priorités commerciales</div>
            <div className="ct-action-list">
              <Link href="/leads" className="ct-action-row">
                <span>
                  <strong>{nbLeadsActifs}</strong>
                  Leads actifs à traiter
                </span>
                <span className="ct-action-arrow">Ouvrir</span>
              </Link>
              <Link href="/visits" className="ct-action-row">
                <span>
                  <strong>{nbVisitesAVenir}</strong>
                  Visites à venir à préparer
                </span>
                <span className="ct-action-arrow">Ouvrir</span>
              </Link>
              <Link href="/mandates" className="ct-action-row">
                <span>
                  <strong>{nbMandatsActifs}</strong>
                  Mandats actifs à piloter
                </span>
                <span className="ct-action-arrow">Ouvrir</span>
              </Link>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Portefeuille" variant="chart">
            <KpiGrid className="cols-2">
              <KpiCard label="En vente" value={String(nbBiensEnVente)} accent />
              <KpiCard label="Mandats actifs" value={String(nbMandatsActifs)} />
            </KpiGrid>
            <div className="ct-mb-sm" />
            <Link href="/properties" className="ct-seg-btn primary" style={{ width: "fit-content" }}>
              Voir les biens
            </Link>
            <div className="ct-mb-sm" />
            <div className="ct-card-title">Actions rapides</div>
            <div className="ct-quick-actions">
              <Link href="/properties" className="ct-seg-btn">Biens</Link>
              <Link href="/leads" className="ct-seg-btn">Leads</Link>
              <Link href="/visits" className="ct-seg-btn">Visites</Link>
              <Link href="/mandates" className="ct-seg-btn">Mandats</Link>
            </div>
          </Card>
        </div>
      </div>

      <Card variant="dense">
        {properties.length === 0 ? (
          <>
            <p className="ct-placeholder">Aucun bien pour le moment.</p>
            <div className="ct-mb-sm" />
            <Link href="/properties" className="ct-seg-btn primary">
              Ajouter un bien
            </Link>
          </>
        ) : (
          <>
            <DataTable
              columns={recentColumns}
              rows={properties}
              emptyLabel="Aucun bien pour le moment."
              getKey={(r) => r.id}
            />
            <div className="ct-mb-sm" />
            <Link href="/properties" className="ct-seg-btn">
              Voir tous les biens
            </Link>
          </>
        )}
      </Card>
    </PageStack>
  );
}
