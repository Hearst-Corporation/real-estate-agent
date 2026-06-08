/**
 * lib/agent/tools/nav.ts — Outil de navigation du chat agentique.
 *
 * `navigate` ne fait AUCUN accès DB : il valide un chemin contre une liste
 * blanche (chemins exacts + préfixes paramétrés /…/<uuid>) puis renvoie une
 * action client { type:"navigate", path }.
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";

/** Chemins exacts autorisés. */
const EXACT_PATHS = new Set<string>([
  "/",
  "/prospection",
  "/estimations",
  "/estimations/new",
  "/properties",
  "/leads",
  "/visits",
  "/mandates",
  "/agenda",
  "/swarms",
  "/invest",
  "/profile",
]);

/** Préfixes paramétrés : /<base>/<uuid>. */
const PARAM_PREFIXES = ["/estimations", "/properties"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True si le chemin est exact OU "/<base>/<uuid>" pour un base autorisé. */
export function isAllowedPath(path: string): boolean {
  if (EXACT_PATHS.has(path)) return true;
  for (const base of PARAM_PREFIXES) {
    if (path.startsWith(`${base}/`)) {
      const tail = path.slice(base.length + 1);
      if (UUID_RE.test(tail)) return true;
    }
  }
  return false;
}

const navigate: AgentTool = {
  name: "navigate",
  description:
    "Ouvre une page de l'application pour l'utilisateur. Chemins valides : / (accueil), /prospection, /estimations, /estimations/new, /properties, /leads, /visits, /mandates, /agenda, /swarms, /invest, /profile, ou une fiche /estimations/<uuid> ou /properties/<uuid>.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Chemin de la page à ouvrir (voir la liste autorisée)." },
    },
    required: ["path"],
  },
  async execute(args): Promise<ToolResult> {
    const raw = typeof args.path === "string" ? args.path.trim() : "";
    // Normalise : retire query/hash, retire le trailing slash sauf pour "/".
    const stripped = raw.split(/[?#]/)[0];
    const path = stripped.length > 1 && stripped.endsWith("/")
      ? stripped.slice(0, -1)
      : stripped;

    if (!path || !isAllowedPath(path)) {
      return {
        ok: false,
        summary: "Navigation refusée",
        observation: `Chemin « ${raw} » non autorisé. Utilise un chemin de la liste blanche.`,
      };
    }
    return {
      ok: true,
      action: { type: "navigate", path },
      summary: `Navigation vers ${path}`,
      observation: "Navigation effectuée.",
    };
  },
};

export const navTools: AgentTool[] = [navigate];
