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
import { createSwarm, generateSpec, getRun, kickoffSwarm, resumeRun } from "@/lib/swarms/client";
import type { ArchitectSpec, SwarmRun } from "@/lib/swarms/types";
import { buildMissionView } from "@/lib/missions/phases";
import type { MissionDecision, MissionPlan, MissionStatus, MissionView } from "@/lib/missions/types";

type Db = SupabaseClient<Database>;

/**
 * Identité résolue, découplée des claims : permet d'appeler le service depuis
 * une route (claims) OU depuis un outil du chat (ToolContext). `ownerId` =
 * owner_id attendu par le moteur (uuidOwnerOf) ; `tenant`/`userId` = la ligne.
 */
export type MissionIdentity = { userId: string; tenant: string; ownerId: string };
type MissionRow = Database["public"]["Tables"]["missions"]["Row"];
type MissionUpdate = Database["public"]["Tables"]["missions"]["Update"];
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

// ─── Types internes pour l'historique de décisions ──────────────────────────

type DecisionLog = {
  kind: "resolved";
  question: string;
  options: unknown;
  chosen: string;
  at: string;
};

/** Décision encore ouverte, persistée pour survie aux redémarrages du moteur. */
type PendingDecisionEntry = {
  kind: "pending";
  pending: { question: string; hint?: string; options: MissionDecision["options"] };
  at: string;
};

type DecisionEntry = DecisionLog | PendingDecisionEntry;

const isPendingEntry = (e: DecisionEntry): e is PendingDecisionEntry => e.kind === "pending";

// ─────────────────────────────────────────────────────────────────────────────

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
  const existingDecisions = (m.decisions ?? []) as unknown as DecisionEntry[];

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
    } else if (run.status === "paused_hitl" && run.decision) {
      // Le moteur a émis un moment de décision : on passe la mission en attente
      // et on persiste la décision ouverte pour qu'elle survive au redémarrage.
      status = "awaiting_decision";
      const existingPending = existingDecisions.find(isPendingEntry);
      const isSamePending =
        existingPending &&
        existingPending.pending.question === run.decision.question &&
        JSON.stringify(existingPending.pending.options) === JSON.stringify(run.decision.options);
      if (!isSamePending) {
        const nextDecisions: DecisionEntry[] = [
          ...existingDecisions.filter((e) => !isPendingEntry(e)),
          {
            kind: "pending",
            pending: {
              question: run.decision.question,
              hint: run.decision.hint,
              options: run.decision.options,
            },
            at: new Date().toISOString(),
          },
        ];
        // Écriture conditionnelle : inclut `status` uniquement si la mission
        // n'était pas déjà en attente, pour éviter les mises à jour inutiles.
        const payload: MissionUpdate = {
          decisions: nextDecisions as unknown as MissionRow["decisions"],
        };
        if (m.status !== "awaiting_decision") payload.status = status;
        await sb
          .from("missions")
          .update(payload)
          .eq("id", m.id)
          .eq("user_id", idn.userId)
          .eq("tenant_id", idn.tenant);
      }
      // Si la décision persistée est identique, on n'écrit rien.
    } else if (
      (run.status === "running" || run.status === "pending") &&
      status === "awaiting_decision"
    ) {
      // Le moteur a repris alors que la mission était encore marquée en attente :
      // on resynchronise le statut et on purge les décisions ouvertes obsolètes.
      status = "running";
      await sb
        .from("missions")
        .update({
          status,
          decisions: existingDecisions.filter(
            (e) => !isPendingEntry(e),
          ) as unknown as MissionRow["decisions"],
        })
        .eq("id", m.id)
        .eq("user_id", idn.userId)
        .eq("tenant_id", idn.tenant);
    }
  }

  // Source de vérité pour la décision présentée au front :
  //   1. run toujours accessible et en pause → on lit directement depuis le run.
  //   2. run introuvable mais mission en attente → fallback sur la décision
  //      persistée (cas redémarrage moteur entre deux polls).
  let decision: MissionDecision | null = null;
  if (status === "awaiting_decision") {
    if (run?.decision) {
      decision = {
        question: run.decision.question,
        hint: run.decision.hint,
        options: run.decision.options,
      };
    } else {
      const fallbackEntry = existingDecisions.find(isPendingEntry);
      if (fallbackEntry) {
        decision = {
          question: fallbackEntry.pending.question,
          hint: fallbackEntry.pending.hint,
          options: fallbackEntry.pending.options,
        };
      }
    }
  }

  return buildMissionView({
    id: m.id,
    title: m.title,
    objective: m.objective,
    status,
    plan,
    run,
    decision,
    error: m.error,
  });
}

/** Remet une mission en attente de décision (rollback d'un claim non abouti). */
async function rollbackToAwaiting(sb: Db, idn: MissionIdentity, missionId: string): Promise<void> {
  await sb
    .from("missions")
    .update({ status: "awaiting_decision" as MissionStatus })
    .eq("id", missionId)
    .eq("user_id", idn.userId)
    .eq("tenant_id", idn.tenant);
}

/**
 * Enregistre le choix humain d'un moment de décision et reprend le run.
 *
 * Appelle le vrai endpoint moteur `resumeRun(swarmId, runId, {decision_id, value})`
 * sur le MÊME run (pas un nouveau kickoff) : le moteur réinjecte la `value`,
 * repasse le run en `running` et reprend à la task suivante. Le `decision_id`
 * est résolu côté serveur depuis le run live (source de vérité) — l'app n'a pas
 * à le threader dans la MissionView. Le choix est journalisé dans
 * `missions.decisions` (historique append-only).
 */
export async function submitDecision(
  sb: Db,
  idn: MissionIdentity,
  missionId: string,
  choice: { decisionId?: string; value: string },
): Promise<{ ok: true } | { error: string }> {
  const value = choice.value?.trim();
  if (!value) return { error: "value_required" };

  // CLAIM ATOMIQUE : on bascule awaiting_decision → running en une seule requête
  // conditionnée sur le statut. Un POST concurrent qui perd la course récupère
  // 0 ligne → no_pending_decision. Ferme la fenêtre de double-kickoff moteur.
  const { data: claimed } = await sb
    .from("missions")
    .update({ status: "running" as MissionStatus })
    .eq("id", missionId)
    .eq("user_id", idn.userId)
    .eq("tenant_id", idn.tenant)
    .eq("status", "awaiting_decision")
    .select("*")
    .maybeSingle<MissionRow>();
  if (!claimed) {
    // Soit la mission n'existe pas / pas à nous, soit décision déjà traitée.
    const { data: exists } = await sb
      .from("missions")
      .select("id")
      .eq("id", missionId)
      .eq("user_id", idn.userId)
      .eq("tenant_id", idn.tenant)
      .maybeSingle();
    return { error: exists ? "no_pending_decision" : "not_found" };
  }
  const m = claimed;

  const runs = (m.runs ?? []) as unknown as RunRef[];
  const current = runs[runs.length - 1] ?? null;
  if (!m.swarm_id || !current) {
    await rollbackToAwaiting(sb, idn, missionId);
    return { error: "no_active_run" };
  }

  // Décision en attente côté moteur = source de vérité du decision_id. Si le run
  // n'expose plus de décision active, c'est qu'elle a déjà été tranchée.
  const run = await getRun(current.run_id, idn.ownerId).catch(() => null);
  const pending = run?.decision ?? null;
  const decisionId = choice.decisionId ?? pending?.id;

  // On déclare `decisions` après les gardes early-return pour éviter de lire
  // un état potentiellement obsolète avant confirmation que la décision est active.
  if (!pending || !decisionId) {
    await rollbackToAwaiting(sb, idn, missionId);
    return { error: "no_pending_decision" };
  }

  const decisions = (m.decisions ?? []) as unknown as DecisionEntry[];

  const log: DecisionLog = {
    kind: "resolved",
    question: pending.question ?? "",
    options: pending.options ?? [],
    chosen: value,
    at: new Date().toISOString(),
  };

  // Reprend le MÊME run via l'endpoint resume (idempotent côté moteur). Le run
  // repasse `running` et reprend à la task suivante avec la value injectée.
  try {
    await resumeRun(m.swarm_id, current.run_id, idn.ownerId, { decision_id: decisionId, value });
  } catch (e) {
    // La reprise a échoué côté réseau. On re-vérifie l'état réel du run :
    // si le moteur a quand même repris (statut != paused_hitl), on continue
    // sans rollback pour ne pas annuler un résumé qui a abouti.
    let runAfter: SwarmRun | null = null;
    try {
      runAfter = await getRun(current.run_id, idn.ownerId);
    } catch {
      // getRun injoignable : on ne peut pas déterminer l'état, on rollback.
    }
    if (runAfter && runAfter.status !== "paused_hitl") {
      // Le moteur a effectivement repris malgré l'erreur réseau : on poursuit.
    } else {
      await rollbackToAwaiting(sb, idn, missionId);
      return { error: `resume_failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }

  // Même run conservé (pas de nouveau kickoff) : on marque son statut local
  // running, on purge les entrées de décision ouvertes et on journalise la décision résolue.
  const decisionsWithoutPending = decisions.filter((e) => !isPendingEntry(e));
  const nextRuns: RunRef[] = runs.map((r, i) =>
    i === runs.length - 1 ? { ...r, status: "running" } : r,
  );
  const { error } = await sb
    .from("missions")
    .update({
      decisions: [...decisionsWithoutPending, log] as unknown as MissionRow["decisions"],
      runs: nextRuns as unknown as MissionRow["runs"],
    })
    .eq("id", m.id)
    .eq("user_id", idn.userId)
    .eq("tenant_id", idn.tenant);
  if (error) return { error: `persist_failed: ${error.message}` };
  return { ok: true };
}
