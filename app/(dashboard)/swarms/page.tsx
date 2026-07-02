import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
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

      {/* TW+ lists__tables/02-simple-in-card — adapté thème sombre */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        {loadError ? (
          <p className="p-5 text-sm text-red-400">{loadError}</p>
        ) : swarms.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{UI.swarms.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Nom
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Statut
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Agents
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Tâches
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {swarms.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-4 text-sm whitespace-nowrap">
                      <Link href={`/swarms/${r.id}`} className="font-medium text-indigo-300 hover:text-indigo-200">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap">
                      <Badge>{r.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}</Badge>
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-400">
                      {`${r.agents?.length ?? 0} agent(s)`}
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-400">
                      {`${r.tasks?.length ?? 0} tâche(s)`}
                    </td>
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
