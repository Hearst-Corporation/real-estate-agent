/**
 * lib/agent/types.ts — Contrat du moteur agentique du chat Cockpit.
 *
 * Définit les frames streamées au client (NDJSON), le contexte d'exécution des
 * tools (client service-role filtré user_id + tenant_id), et la forme d'un tool.
 * Aucun comportement ici — uniquement des types.
 */

import type { Gpu1Client } from "@/lib/gpu1";
import type { Database } from "@/lib/gpu1/database.types";

/** Action déclenchée côté client (navigation, ou mise à jour live d'un champ d'estimation). */
export type ClientAction =
  | { type: "navigate"; path: string }
  | { type: "estimation_field"; estimationId: string; field: string; value: string | number | boolean };

/**
 * Frame émise dans le flux NDJSON (une frame JSON par ligne).
 * - chat   : id du chat (créé/retrouvé) — émis en premier.
 * - text   : delta de texte visible (réponse de l'assistant).
 * - tool   : cycle de vie d'un appel d'outil (chip UI).
 * - action : action à exécuter côté client (navigation…).
 * - error  : erreur non récupérable du tour.
 * - done   : fin du stream.
 */
export type AgentFrame =
  | { type: "chat"; chatId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; status: "running" | "ok" | "error"; summary: string }
  | { type: "action"; action: ClientAction }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Contexte injecté dans chaque tool.
 * `sb` est un client service-role (bypass RLS) → TOUJOURS filtrer
 * `.eq("user_id", userId).eq("tenant_id", tenant)` dans chaque requête.
 */
export interface ToolContext {
  userId: string;
  tenant: string;
  /** owner_id attendu par le moteur MySwarms (uuidOwnerOf) — pour les outils
   *  qui lancent/pilotent des missions (sinon égal à userId). */
  ownerId: string;
  /** Origine HTTP de la requête (ex. https://app…) — pour construire des URLs
   *  absolues (lien de partage d'avis de valeur). */
  origin: string;
  sb: Gpu1Client<Database>;
  emit: (frame: AgentFrame) => void;
}

/** Résultat d'un tool : `summary` pour le chip UI, `observation` renvoyée au LLM. */
export interface ToolResult {
  /** true si l'opération a réussi. */
  ok: boolean;
  /** Résumé court FR pour le chip UI (ex : "Lead Jean Dupont créé"). */
  summary: string;
  /** Texte FR renvoyé au LLM comme tool_result (observation). */
  observation: string;
  /** Action client optionnelle (ex : navigation après create_estimation). */
  action?: ClientAction;
}

/** Un outil agentique : nom, description, schéma JSON d'entrée, exécution. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema objet : { type:"object", properties:{...}, required:[...] }. */
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}
