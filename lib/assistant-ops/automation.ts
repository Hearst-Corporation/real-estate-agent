/**
 * lib/assistant-ops/automation.ts — pont LECTURE-SEULE vers la frontière Aigent (W9).
 *
 * L'assistant CONSOMME la frontière Aigent existante (`lib/aigent/runtime`) pour
 * savoir si un exécutant automatisé est disponible — il ne la MODIFIE jamais, ne
 * crée aucun agent, ne lance aucun run ici. La distinction produite est la VÉRITÉ
 * attendue :
 *   - `live`        : registre configuré ET au moins un agent publié.
 *   - `config`      : registre non configuré / non joignable / vide → l'automatisation
 *                     n'est pas branchée, MAIS l'analyse locale reste servie.
 *   - `unavailable` : le registre a répondu par une erreur franche (invalid/transport).
 *
 * Jamais un faux agent, jamais un faux run : `config`/`unavailable` sont des états
 * de première classe, honnêtes, rendus tels quels à l'écran.
 */

import "server-only";

import { listAgents, runtimeAvailability } from "@/lib/aigent/runtime";
import { RUNTIME_PROJECT_KEY } from "@/lib/aigent/runtime-types";
import type { AutomationStatus } from "@/lib/assistant-ops/types";

/**
 * Résout l'état de l'automatisation Aigent SANS jamais fabriquer de donnée.
 * N'émet une requête réseau QUE si le registre est configuré (sinon `config`
 * immédiat, aucune requête — état honnête et attendu tant qu'Aigent est absent).
 */
export async function resolveAutomation(): Promise<AutomationStatus> {
  const avail = runtimeAvailability();
  if (!avail.available) {
    return { mode: "config", reason: avail.reason };
  }

  const result = await listAgents(RUNTIME_PROJECT_KEY);
  if (result.ok) {
    // Registre joignable : `live` seulement s'il existe des agents publiés.
    // Registre vide = honnête → `config` (rien à exécuter, mais analyse locale OK).
    return result.data.length > 0
      ? { mode: "live", agentCount: result.data.length }
      : { mode: "config", reason: "not_provisioned" };
  }
  if ("unavailable" in result) {
    return { mode: "config", reason: result.unavailable.reason };
  }
  // 404 (skeleton) / conflict / erreur transport / invalid_response → indisponible franc.
  return { mode: "unavailable" };
}
