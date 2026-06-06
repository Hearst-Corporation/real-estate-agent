import { Eyebrow, Title, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { uuidOwnerOf } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { listSwarms, SwarmsEngineUnavailableError } from "@/lib/swarms/client";
import SwarmCard from "@/components/swarms/SwarmCard";
import type { Swarm } from "@/lib/swarms/types";
import Link from "next/link";
import { UI } from "@/lib/ui-strings";

export default async function SwarmsPage() {
  const claims = await getSession();
  const ownerId = claims ? uuidOwnerOf(claims) : null;

  let swarms: Swarm[] = [];
  let loadError: string | null = null;
  if (ownerId) {
    try {
      swarms = await listSwarms(ownerId);
    } catch (err) {
      loadError =
        err instanceof SwarmsEngineUnavailableError
          ? UI.swarms.engineUnavailable
          : UI.swarms.engineFetchFailed;
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
      <Eyebrow>{UI.swarms.eyebrow}</Eyebrow>
      <Title>{UI.swarms.title}</Title>

      <KpiGrid className="cols-4">
        <KpiCard label={UI.swarms.kpis.total} value={String(total)} />
        <KpiCard label={UI.swarms.kpis.active} value={String(active)} className="accent" />
        <KpiCard label={UI.swarms.kpis.inactive} value={String(inactive)} />
        <KpiCard label={UI.swarms.kpis.runsToday} value={String(runsToday)} />
      </KpiGrid>

      <div className="ct-mb-sm" />

      <div style={{ marginBottom: "var(--ct-space-md)" }}>
        <Link href="/swarms/new" className="ct-btn ct-btn-primary">
          {UI.swarms.newCta}
        </Link>
      </div>

      {loadError ? (
        <Card>
          <p className="ct-error">{loadError}</p>
        </Card>
      ) : swarms.length === 0 ? (
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
