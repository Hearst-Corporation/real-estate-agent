/**
 * lib/agent/tools/missions.ts — Outils « missions » du chat agentique.
 *
 * Lancer une mission autonome (architect → swarm → run) et lister les missions,
 * en langage humain. La mission tourne sur MySwarms ; la Mission View la traduit.
 * Filtrage tenant systématique via ctx (service-role bypass RLS).
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";
import { createMission } from "@/lib/missions/service";

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

const createMissionTool: AgentTool = {
  name: "create_mission",
  description:
    "Lance une mission autonome : l'équipe IA prépare un plan puis travaille (sourcing, campagne, relance…) à partir d'un objectif en langage naturel. Ex : « trouver des propriétaires vendeurs dans le 11e et préparer une approche ». Démarre un VRAI travail (long) et ouvre le suivi. Utilise-le quand l'utilisateur veut déléguer un objectif, pas une simple action CRM ponctuelle.",
  inputSchema: {
    type: "object",
    properties: {
      objective: { type: "string", description: "L'objectif de la mission, en clair (obligatoire)." },
      title: { type: "string", description: "Titre court de la mission (optionnel)." },
    },
    required: ["objective"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const objective = asString(args.objective);
    if (!objective) {
      return {
        ok: false,
        summary: "Objectif manquant",
        observation: "Demande à l'utilisateur l'objectif précis de la mission avant de la lancer.",
      };
    }
    const res = await createMission(
      ctx.sb,
      { userId: ctx.userId, tenant: ctx.tenant, ownerId: ctx.ownerId },
      { objective, title: asString(args.title) },
    );
    if ("error" in res) {
      return {
        ok: false,
        summary: "Mission non lancée",
        observation: `La mission n'a pas pu démarrer (${res.error}).`,
      };
    }
    return {
      ok: true,
      summary: "Mission lancée",
      observation: `Mission « ${objective} » lancée. J'ouvre son suivi pour l'utilisateur.`,
      action: { type: "navigate", path: `/missions/${res.id}` },
    };
  },
};

const listMissions: AgentTool = {
  name: "list_missions",
  description: "Liste les missions de l'utilisateur (en cours et passées).",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Nombre max (défaut 20)." } },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const n = typeof args.limit === "number" ? args.limit : Number(args.limit);
    const limit = Math.min(Math.max(Number.isFinite(n) ? Math.trunc(n) : 20, 1), 50);
    const { data, error } = await ctx.sb
      .from("missions")
      .select("id, title, status, created_at")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return { ok: false, summary: "Échec lecture", observation: "Impossible de lire les missions." };
    }
    const rows = data ?? [];
    const lines = rows.map((r) => `- ${r.title} (${r.status}) [${r.id}]`).join("\n");
    return {
      ok: true,
      summary: `${rows.length} mission(s)`,
      observation: rows.length ? `Missions (${rows.length}) :\n${lines}` : "Aucune mission pour le moment.",
    };
  },
};

export const missionTools: AgentTool[] = [createMissionTool, listMissions];
