import { PageHeader, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { tenantOf } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { listSwarms } from "@/lib/swarms/client";
import SwarmCard from "@/components/swarms/SwarmCard";
import type { Swarm } from "@/lib/swarms/types";
import Link from "next/link";
import { UI } from "@/lib/ui-strings";

export default async function SwarmsPage() {
  const claims = await getSession();
  const ownerId = claims ? tenantOf(claims) : null;

  let swarms: Swarm[] = [];
  if (ownerId) {
    try {
      swarms = await listSwarms(ownerId);
    } catch {
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
    <>
      <PageHeader
        eyebrow={UI.swarms.eyebrow}
        title={UI.swarms.title}
        actions={
          <Link href="/swarms/new" className="ct-seg-btn primary">
            {UI.swarms.newCta}
          </Link>
        }
      />

      <KpiGrid className="cols-4">
        <KpiCard label={UI.swarms.kpis.total} value={String(total)} />
        <KpiCard label={UI.swarms.kpis.active} value={String(active)} className="accent" />
        <KpiCard label={UI.swarms.kpis.inactive} value={String(inactive)} />
        <KpiCard label={UI.swarms.kpis.runsToday} value={String(runsToday)} />
      </KpiGrid>

      <div className="ct-mb-sm" />

      {swarms.length === 0 ? (
        <Card>
          <p className="crm-empty">{UI.swarms.empty}</p>
        </Card>
      ) : (
        <div className="crm-grid">
          {swarms.map((swarm) => (
            <SwarmCard
              key={swarm.id}
              id={swarm.id}
              name={swarm.name}
              description={swarm.description}
              isActive={swarm.is_active}
              agentCount={swarm.agents?.length ?? 0}
              taskCount={swarm.tasks?.length ?? 0}
            />
          ))}
        </div>
      )}
    </>
  );
}
