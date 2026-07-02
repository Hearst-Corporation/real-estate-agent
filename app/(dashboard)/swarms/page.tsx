import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { getSession } from "@/lib/server/session";
import { uuidOwnerOf } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { listSwarms } from "@/lib/swarms/client";
import type { Swarm } from "@/lib/swarms/types";
import Link from "next/link";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";

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

  const columns: Column<Swarm>[] = [
    {
      key: "name",
      header: "Nom",
      render: (r) => (
        <Link href={`/swarms/${r.id}`} className="font-medium text-indigo-300 hover:text-indigo-200">
          {r.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (r) => (
        <Badge>{r.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}</Badge>
      ),
    },
    {
      key: "agents",
      header: "Agents",
      render: (r) => `${r.agents?.length ?? 0} agent(s)`,
    },
    {
      key: "tasks",
      header: "Tâches",
      render: (r) => `${r.tasks?.length ?? 0} tâche(s)`,
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={UI.swarms.eyebrow}
        title={UI.swarms.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.swarms} />}
        action={
          <Link
            href="/swarms/new"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
          >
            {UI.swarms.newCta}
          </Link>
        }
        kpis={[
          { label: UI.swarms.kpis.total, value: String(total) },
          { label: UI.swarms.kpis.active, value: String(active) },
          { label: UI.swarms.kpis.inactive, value: String(inactive) },
          { label: UI.swarms.kpis.runsToday, value: String(runsToday) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <Card title="Activité" variant="chart">
          <p className="py-8 text-center text-sm text-slate-500">Aucune activité récente.</p>
        </Card>
        <Card title="Ressources" variant="chart">
          <p className="py-8 text-center text-sm text-slate-500">Aucune ressource allouée.</p>
        </Card>
      </div>

      <Card variant="dense">
        {loadError ? (
          <p className="text-sm text-red-400">{loadError}</p>
        ) : (
          <DataTable
            columns={columns}
            rows={swarms}
            emptyLabel={UI.swarms.empty}
            getKey={(s) => s.id}
          />
        )}
      </Card>
    </PageStack>
  );
}
