/**
 * lib/agent/tools/swarms.ts — Outils swarms (niveau « équipe d'agents ») du chat.
 *
 * Pour les power-users : lister et lancer un swarm existant. Pour un OBJECTIF
 * métier en langage naturel, préférer `create_mission` (plus user-friendly).
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";
import { kickoffSwarm, listSwarms } from "@/lib/swarms/client";

const listSwarmsTool: AgentTool = {
  name: "list_swarms",
  description: "Liste les équipes d'agents (swarms) disponibles — templates globaux et ceux de l'utilisateur.",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute(_args, ctx): Promise<ToolResult> {
    const swarms = await listSwarms(ctx.ownerId).catch(() => []);
    const lines = swarms.map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""} [${s.id}]`).join("\n");
    return {
      ok: true,
      summary: `${swarms.length} swarm(s)`,
      observation: swarms.length ? `Swarms disponibles (${swarms.length}) :\n${lines}` : "Aucun swarm disponible.",
    };
  },
};

const kickoffSwarmTool: AgentTool = {
  name: "kickoff_swarm",
  description:
    "Lance l'exécution d'un swarm existant (swarmId requis — retrouve-le via list_swarms) et ouvre le suivi du run. Pour un objectif métier exprimé en langage naturel, préfère create_mission.",
  inputSchema: {
    type: "object",
    properties: { swarmId: { type: "string", description: "UUID du swarm à lancer (obligatoire)." } },
    required: ["swarmId"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const swarmId = typeof args.swarmId === "string" ? args.swarmId.trim() : "";
    if (!swarmId) return { ok: false, summary: "swarmId manquant", observation: "Retrouve l'id du swarm via list_swarms avant de le lancer." };

    let runId: string;
    let status: string;
    try {
      const kick = await kickoffSwarm(swarmId, ctx.ownerId);
      runId = kick.run_id;
      status = kick.status;
    } catch (e) {
      return { ok: false, summary: "Lancement échoué", observation: `Le swarm n'a pas pu démarrer (${e instanceof Error ? e.message : "erreur"}).` };
    }
    // Persiste le run localement (même logique que /api/swarms/[id]/kickoff).
    await ctx.sb
      .from("swarm_runs")
      .insert({ tenant_id: ctx.tenant, user_id: ctx.userId, swarm_id: swarmId, run_id: runId, status })
      .select("id")
      .maybeSingle();

    return {
      ok: true,
      summary: "Swarm lancé",
      observation: `Swarm lancé (run ${runId}). J'ouvre le suivi.`,
      action: { type: "navigate", path: `/swarms/${swarmId}/run/${runId}` },
    };
  },
};

export const swarmsTools: AgentTool[] = [listSwarmsTool, kickoffSwarmTool];
