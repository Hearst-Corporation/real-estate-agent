import { PageHeader, PageStack } from "@/components/cockpit/primitives";
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
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

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

      <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
        <Subheading level={2} className="mb-3">{t.zonesTitle}</Subheading>
        {zones.length === 0 ? (
          <Text className="py-8 text-center">{t.zonesEmpty}</Text>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <Badge key={z}>{z}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
        <Subheading level={2} className="mb-3">{t.recentTitle}</Subheading>
        {annonces.length === 0 ? (
          <Text className="py-8 text-center">{t.empty}</Text>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t.cols.commune}</TableHeader>
                <TableHeader>{t.cols.type}</TableHeader>
                <TableHeader className="text-right">{t.cols.prix}</TableHeader>
                <TableHeader className="text-right">{t.cols.surface}</TableHeader>
                <TableHeader>{t.cols.source}</TableHeader>
                <TableHeader className="text-right">{t.cols.date}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {annonces.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-zinc-950 dark:text-white">{r.commune ?? "—"}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{r.type_bien ?? "—"}</TableCell>
                  <TableCell className="text-right text-zinc-500 dark:text-zinc-400">{eur(r.prix)}</TableCell>
                  <TableCell className="text-right text-zinc-500 dark:text-zinc-400">{sqm(r.surface_m2)}</TableCell>
                  <TableCell>
                    <Badge>{r.source_platform}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-zinc-500 dark:text-zinc-400">{dateFr(r.date_collecte)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageStack>
  );
}
