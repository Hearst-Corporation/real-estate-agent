import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
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

      {/* TW+ lists__tables/02-simple-in-card — adapté thème sombre */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-3.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t.recentTitle}
        </div>
        {annonces.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.commune}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.type}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.prix}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.surface}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.source}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.date}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {annonces.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-100">{r.commune ?? "—"}</td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-400">{r.type_bien ?? "—"}</td>
                    <td className="px-5 py-4 text-right text-sm whitespace-nowrap text-slate-400">{eur(r.prix)}</td>
                    <td className="px-5 py-4 text-right text-sm whitespace-nowrap text-slate-400">{sqm(r.surface_m2)}</td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap">
                      <Badge>{r.source_platform}</Badge>
                    </td>
                    <td className="px-5 py-4 text-right text-sm whitespace-nowrap text-slate-400">{dateFr(r.date_collecte)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageStack>
  );
}
