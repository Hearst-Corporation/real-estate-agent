import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { apifyProspectionIsConfigured } from "@/lib/prospection/apify-source";
import { moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import { eur, sqm, dateFr } from "@/lib/crm/format";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { ScrapeButton } from "./_components/ScrapeButton";

export const dynamic = "force-dynamic";

type AnnonceRow = {
  id: string;
  commune: string | null;
  type_bien: string | null;
  prix: number | null;
  surface_m2: number | null;
  source_platform: string;
  date_collecte: string;
};

export default async function ScrapersPage() {
  const t = UI.scrapers;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  const providerLabel = moteurImmoIsConfigured()
    ? t.providerMoteurImmo
    : apifyProspectionIsConfigured()
      ? t.providerApify
      : t.providerNone;
  const canScrape = moteurImmoIsConfigured() || apifyProspectionIsConfigured();

  let zones: string[] = [];
  let annonces: AnnonceRow[] = [];
  let total = 0;
  if (claims && sb) {
    const { data: cfg } = await sb
      .from("prosp_config")
      .select("zones_prioritaires")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .maybeSingle();
    zones = (cfg?.zones_prioritaires as string[] | null) ?? [];

    const { data, count } = await sb
      .from("prosp_annonces")
      .select(
        "id, commune, type_bien, prix, surface_m2, source_platform, date_collecte",
        { count: "exact" },
      )
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .order("date_collecte", { ascending: false })
      .limit(30);
    annonces = (data ?? []) as AnnonceRow[];
    total = count ?? 0;
  }

  const columns: Column<AnnonceRow>[] = [
    { key: "commune", header: t.cols.commune, render: (r) => r.commune ?? "—" },
    { key: "type", header: t.cols.type, render: (r) => r.type_bien ?? "—" },
    { key: "prix", header: t.cols.prix, align: "right", render: (r) => eur(r.prix) },
    { key: "surface", header: t.cols.surface, align: "right", render: (r) => sqm(r.surface_m2) },
    {
      key: "source",
      header: t.cols.source,
      render: (r) => <Badge>{r.source_platform}</Badge>,
    },
    { key: "date", header: t.cols.date, align: "right", render: (r) => dateFr(r.date_collecte) },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.swarms} />}
        action={<ScrapeButton disabled={!canScrape} />}
        kpis={[
          { label: t.kpis.annonces, value: String(total) },
          { label: t.kpis.provider, value: providerLabel },
          { label: t.kpis.zones, value: String(zones.length) },
        ]}
      />

      <Card title={t.zonesTitle} variant="dense">
        {zones.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{t.zonesEmpty}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <Badge key={z}>{z}</Badge>
            ))}
          </div>
        )}
      </Card>

      <Card title={t.recentTitle} variant="dense">
        <DataTable
          columns={columns}
          rows={annonces}
          emptyLabel={t.empty}
          getKey={(r) => r.id}
        />
      </Card>
    </PageStack>
  );
}
