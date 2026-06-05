import { Eyebrow, Title, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { tenantOf } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { listSwarms } from "@/lib/swarms/client";
import SwarmCard from "@/components/swarms/SwarmCard";
import type { Swarm } from "@/lib/swarms/types";
import Link from "next/link";

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
      <Eyebrow>MySwarms</Eyebrow>
      <Title>Swarms</Title>

      <KpiGrid className="cols-4">
        <KpiCard label="Total swarms" value={String(total)} />
        <KpiCard label="Actifs" value={String(active)} className="accent" />
        <KpiCard label="Inactifs" value={String(inactive)} />
        <KpiCard label="Runs aujourd'hui" value={String(runsToday)} />
      </KpiGrid>

      <div className="ct-mb-sm" />

      <div style={{ marginBottom: "var(--ct-space-md)" }}>
        <Link href="/swarms/new" className="ct-btn ct-btn-primary">
          Nouveau swarm
        </Link>
      </div>

      {swarms.length === 0 ? (
        <Card>
          <p className="crm-empty">Aucun swarm configuré. Créez votre premier swarm pour automatiser vos analyses.</p>
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
