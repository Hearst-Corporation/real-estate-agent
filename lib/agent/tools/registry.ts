/**
 * lib/agent/tools/registry.ts — Registre central des outils agentiques.
 *
 * Agrège CRM + navigation + Composio. `getTool(name)` résout un outil
 * par nom lors de l'exécution d'un tool_use / tool_call du LLM.
 */

import type { AgentTool } from "@/lib/agent/types";
import { crmTools } from "./crm";
import { navTools } from "./nav";
import { composioTools } from "./composio";

export const ALL_TOOLS: AgentTool[] = [...crmTools, ...navTools, ...composioTools];

export function getTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
