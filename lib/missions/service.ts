// ─── Missions — service serveur (créer / suivre) ────────────────────────────
//
// Orchestration côté Next (le moteur ne fait que des runs atomiques) :
//   createMission : objectif → architect (plan) → createSwarm → kickoff(inputs)
//   getMissionState : charge la mission + poll le run courant → buildMissionView
//
// Tenant : la LIGNE mission suit le pattern CRM (tenantOf + user_id, client
// service-role qui bypass la RLS → filtrage manuel). Les appels MOTEUR utilisent
// uuidOwnerOf (owner_id attendu par l'engine).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createSwarm, generateSpec, getRun, kickoffSwarm } from "@/lib/swarms/client";
import type { ArchitectSpec } from "@/lib/swarms/types";
import { buildMissionView } from "@/lib/missions/phases";
import type { MissionPlan, MissionStatus, MissionView } from "@/lib/missions/types";

type Db = SupabaseClient<Database>;

/**
 * Identité résolue, découplée des claims : permet d'appeler le service depuis
 * une route (claims) OU depuis un outil du chat (ToolContext). `ownerId` =
 * owner_id attendu par le moteur (uuidOwnerOf) ; `tenant`/`userId` = la ligne.
 */
export type MissionIdentity = { userId: string; tenant: string; ownerId: string };
type MissionRow = Database["public"]["Tables"]["missions"]["Row"];
type RunRef = { run_id: string; label: string; status: string };

/** Crée une mission : génère le plan, monte le swarm, lance le 1er run. Lent
 *  (l'architect prend 60-90s) → à appeler depuis une route maxDuration ≥ 90. */
export async function createMission(
  sb: Db,
  idn: MissionIdentity,
  args: { objective: string; title?: string; input?: Record<string, unknown>; entityType?: string; entityId?: string },
): Promise<{ id: string } | { error: string }> {
  const objective = args.objective.trim();
  if (!objective) return { error: "objective_required" };
  const ownerId = idn.ownerId;

  // 1. Plan (architect). L'engine renvoie { spec, rationale } → on extrait spec.
  let spec: ArchitectSpec;
  try {
    const raw = (await generateSpec(objective, ownerId)) as unknown as { spec?: ArchitectSpec };
    spec = (raw?.spec ?? (raw as unknown as ArchitectSpec));
  } catch (e) {
    return { error: `architect_failed: ${e instanceof Error ? e.message : "unknown"}` };
  }
  if (!spec?.agents?.length || !spec?.tasks?.length) return { error: "empty_plan" };

  // 2. Monte le swarm réel.
  let swarmId: string;
  try {
    const swarm = await createSwarm({
      name: spec.name || args.title || "Mission",
      description: spec.description,
      owner_id: ownerId,
      agents: spec.agents,
      tasks: spec.tasks,
      tool_bindings: spec.tool_bindings,
    });
    swarmId = swarm.id;
  } catch (e) {
    return { error: `swarm_create_failed: ${e instanceof Error ? e.message : "unknown"}` };
  }

  // 3. Lance le 1er run, en passant l'objectif + les paramètres dans inputs.
  const input = { objective, ...(args.input ?? {}) };
  let runId: string;
  try {
    const kick = await kickoffSwarm(swarmId, ownerId, input);
    runId = kick.run_id;
  } catch (e) {
    return { error: `kickoff_failed: ${e instanceof Error ? e.message : "unknown"}` };
  }

  // 4. Persiste la mission.
  const plan: MissionPlan = { spec: { name: spec.name, description: spec.description, agents: spec.agents, tasks: spec.tasks } };
  const runs: RunRef[] = [{ run_id: runId, label: "principal", status: "running" }];
  const insert = {
    user_id: idn.userId,
    tenant_id: idn.tenant,
    title: args.title || spec.name || "Mission",
    objective,
    status: "running" as MissionStatus,
    swarm_id: swarmId,
    plan: plan as unknown as Database["public"]["Tables"]["missions"]["Insert"]["plan"],
    input: input as unknown as Database["public"]["Tables"]["missions"]["Insert"]["input"],
    runs: runs as unknown as Database["public"]["Tables"]["missions"]["Insert"]["runs"],
    entity_type: args.entityType ?? null,
    entity_id: args.entityId ?? null,
  };
  const { data, error } = await sb.from("missions").insert(insert).select("id").single();
  if (error || !data) return { error: `persist_failed: ${error?.message ?? "no row"}` };
  return { id: data.id };
}

/** Charge la mission + poll le run courant → MissionView (langage humain). */
export async function getMissionState(sb: Db, idn: MissionIdentity, missionId: string): Promise<MissionView | null> {
  const { data: m } = await sb
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .eq("user_id", idn.userId)
    .eq("tenant_id", idn.tenant)
    .single<MissionRow>();
  if (!m) return null;

  const plan = (m.plan ?? null) as MissionPlan | null;
  const runs = (m.runs ?? []) as unknown as RunRef[];
  const current = runs[runs.length - 1] ?? null;

  // Poll live du run courant (best-effort : moteur indispo → on rend l'état connu).
  const run = current ? await getRun(current.run_id, idn.ownerId).catch(() => null) : null;

  // Synchronise le statut mission sur l'état du run (slice 1 : run unique).
  let status = m.status as MissionStatus;
  if (run) {
    if (run.status === "done" && status !== "done") {
      status = "done";
      await sb
        .from("missions")
        .update({ status, result: { text: run.output ?? null } as unknown as MissionRow["result"] })
        .eq("id", m.id)
        .eq("user_id", idn.userId)
        .eq("tenant_id", idn.tenant);
    } else if ((run.status === "failed" || run.status === "error") && status !== "failed") {
      status = "failed";
      await sb
        .from("missions")
        .update({ status, error: run.output ?? "run_failed" })
        .eq("id", m.id)
        .eq("user_id", idn.userId)
        .eq("tenant_id", idn.tenant);
    }
  }

  return buildMissionView({
    id: m.id,
    title: m.title,
    objective: m.objective,
    status,
    plan,
    run,
    decision: null, // slice 2 : décisions orchestrées (sous-runs)
    error: m.error,
  });
}
