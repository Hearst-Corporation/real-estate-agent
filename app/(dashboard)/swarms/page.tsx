import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { getSession } from "@/lib/server/session";
import { uuidOwnerOf } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { listSwarms } from "@/lib/swarms/client";
import type { Swarm } from "@/lib/swarms/types";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { Button } from "@/components/ui/button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "@/components/ui/heading";
import { Text, TextLink } from "@/components/ui/text";
import { ErrorMessage } from "@/components/ui/fieldset";

export default async function SwarmsPage() {
  const claims = await getSession();
  const ownerId = claims ? uuidOwnerOf(claims) : null;

  let swarms: Swarm[] = [];
  let loadError: string | null = null;
  if (ownerId) {
    try {
      swarms = await listSwarms(ownerId);
    } catch {
      loadError = UI.swarms.engineFetchFailed;
      swarms = [];
    }
  }

  // KPI runs du jour
  let runsToday = 0;
  if (ownerId) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await sb
        .from("swarm_runs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ownerId)
        .gte("created_at", today.toISOString());
      runsToday = count ?? 0;
    }
  }

  const total = swarms.length;
  const active = swarms.filter((s) => s.is_active).length;
  const inactive = total - active;

  return (
    <PageStack>
      <PageHeader
        kicker={UI.swarms.eyebrow}
        title={UI.swarms.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.swarms} />}
        action={
          <Button href="/swarms/new" color="indigo">
            {UI.swarms.newCta}
          </Button>
        }
        kpis={[
          { label: UI.swarms.kpis.total, value: String(total) },
          { label: UI.swarms.kpis.active, value: String(active) },
          { label: UI.swarms.kpis.inactive, value: String(inactive) },
          { label: UI.swarms.kpis.runsToday, value: String(runsToday) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
          <Subheading level={2} className="mb-3">Activité</Subheading>
          <Text className="py-8 text-center">Aucune activité récente.</Text>
        </div>
        <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
          <Subheading level={2} className="mb-3">Ressources</Subheading>
          <Text className="py-8 text-center">Aucune ressource allouée.</Text>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
        {loadError ? (
          <ErrorMessage className="[&>[data-slot=error]]:mt-0">{loadError}</ErrorMessage>
        ) : swarms.length === 0 ? (
          <Text className="py-8 text-center">{UI.swarms.empty}</Text>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Nom</TableHeader>
                <TableHeader>Statut</TableHeader>
                <TableHeader>Agents</TableHeader>
                <TableHeader>Tâches</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {swarms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <TextLink href={`/swarms/${r.id}`}>{r.name}</TextLink>
                  </TableCell>
                  <TableCell>
                    <Badge color={r.is_active ? "indigo" : "zinc"}>
                      {r.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {`${r.agents?.length ?? 0} agent(s)`}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {`${r.tasks?.length ?? 0} tâche(s)`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageStack>
  );
}
