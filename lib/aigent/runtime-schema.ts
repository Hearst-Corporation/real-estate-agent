import "server-only";

import { z } from "zod";
import type {
  ListAgentsResponse,
  ListRunEventsResponse,
  PublishedAgent,
  RuntimeRun,
  RuntimeRunEvent,
} from "@/lib/aigent/runtime-types";

/**
 * VALIDATION STRICTE des réponses du registre runtime Aigent (OUTBOUND).
 * =================================================================
 *
 * Contrat consommateur non négociable (règles back-end + MISSION REA-M04-04) :
 * une réponse HTTP 200 dont le CORPS ne valide PAS le schéma attendu ne doit
 * JAMAIS être transformée en liste vide, en run « fonctionnel » factice, ni en
 * faux succès. Elle produit un état `error` explicite (« invalid_response »).
 *
 * Le `RuntimeResult<T>` du client (`runtime.ts`) reste la frontière honnête :
 * ces schémas décident seulement « la forme est-elle réelle ? » — jamais ils
 * ne fabriquent une valeur de remplacement.
 *
 * Notes de conception :
 *   - Les champs `data` / `output` / `payload` sont OPAQUES au contrat générique
 *     (`z.unknown()`) : leur forme dépend de l'agent, on ne l'interprète pas ici.
 *   - Les schémas sont `.passthrough()`-équivalents (Zod v4 : `.loose()`) : le
 *     registre PEUT ajouter des champs sans casser le consommateur. On valide la
 *     PRÉSENCE et le TYPE des champs qu'on utilise, pas l'absence des autres —
 *     durcir jusqu'au `.strict()` casserait au moindre ajout côté producteur.
 *   - Un registre qui répond `{ ok:true, agents:[] }` est VALIDE (registre vide,
 *     état honnête et attendu) — distinct d'un 200 malformé.
 */

/** Miroir de `PublishedAgentStatus` (runtime-types.ts). Enum figée du contrat §5. */
export const PublishedAgentStatusSchema = z.enum([
  "specification",
  "draft",
  "testing",
  "production",
  "paused",
  "unavailable",
]);

/** Miroir de `RuntimeRunStatus` (runtime-types.ts). Enum figée du contrat §7. */
export const RuntimeRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_on_input",
  "completed",
  "failed",
]);

/** Corps d'erreur structuré d'un run échoué (`RuntimeErrorBody`, contrat §10). */
export const RuntimeErrorBodySchema = z
  .object({
    code: z.string().min(1),
    message: z.string(),
    requestId: z.string().optional(),
  })
  .loose();

/**
 * Un agent publié (`PublishedAgent`, contrat §5/§12). `id`/`name`/`status` sont
 * REQUIS — un agent sans identité ni statut n'est pas un agent réel, c'est un
 * corps malformé. `projectKey` requis (frontière inter-projets). Le reste est
 * informatif/optionnel. `.loose()` : le registre peut enrichir sans casser.
 */
export const PublishedAgentSchema = z
  .object({
    id: z.string().min(1),
    projectKey: z.string().min(1),
    name: z.string().min(1),
    status: PublishedAgentStatusSchema,
    version: z.string().optional(),
    description: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    model: z.string().optional(),
    requiresHumanApproval: z.boolean().optional(),
    publishedAt: z.string().optional(),
  })
  .loose();

/**
 * Un événement ordonné d'un run (`RuntimeRunEvent`, contrat §6). `sequence`
 * (entier ≥ 0) et `type` sont REQUIS — c'est le curseur de polling + le
 * discriminant. `data` opaque. Un event sans séquence casse le polling → invalide.
 */
export const RuntimeRunEventSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    type: z.string().min(1),
    at: z.string().optional(),
    data: z.unknown().optional(),
  })
  .loose();

/**
 * Un run runtime (`RuntimeRun`, contrat §7/§10). `id`/`projectKey`/`agentId`/
 * `status` REQUIS — un run sans état ni identité n'est pas un run réel. `output`
 * opaque (validé côté producteur via l'`outputSchema` de l'agent, jamais ici).
 */
export const RuntimeRunSchema = z
  .object({
    id: z.string().min(1),
    projectKey: z.string().min(1),
    agentId: z.string().min(1),
    status: RuntimeRunStatusSchema,
    requestId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    output: z.unknown().optional(),
    error: RuntimeErrorBodySchema.optional(),
  })
  .loose();

/**
 * Réponse `GET /projects/:projectKey/agents` (contrat §12). Deux formes admises,
 * SANS jamais fabriquer de tableau : l'enveloppe `{ agents:[…] }` OU un tableau
 * nu `[…]`. `agents` doit être un tableau d'agents VALIDES (chaque élément passe
 * `PublishedAgentSchema`) — un élément malformé invalide toute la réponse.
 */
export const ListAgentsResponseSchema = z.union([
  z.object({ agents: z.array(PublishedAgentSchema) }).loose(),
  z.array(PublishedAgentSchema),
]);

/**
 * Réponse `GET /runs/:runId/events` (contrat §6). Enveloppe `{ events:[…] }` OU
 * tableau nu. Chaque événement doit être valide (curseur fiable).
 */
export const ListRunEventsResponseSchema = z.union([
  z.object({ events: z.array(RuntimeRunEventSchema) }).loose(),
  z.array(RuntimeRunEventSchema),
]);

/**
 * Réponse détail agent (`GET /agents/:agentId`). Le contrat §10 renvoie le succès
 * en `{ ok:true, ...ressource }` ; on accepte l'agent à plat OU sous `{ agent }`,
 * sans jamais retomber sur un objet vide (`{}` = malformé, pas un agent).
 */
export const AgentDetailResponseSchema = z.union([
  z.object({ agent: PublishedAgentSchema }).loose(),
  PublishedAgentSchema,
]);

/** Réponse enveloppant un run (`{ run:{…} }` ou run à plat). Jamais `{}`. */
export const RunEnvelopeResponseSchema = z.union([
  z.object({ run: RuntimeRunSchema }).loose(),
  RuntimeRunSchema,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Extracteurs stricts : parsent la forme réelle et NORMALISENT vers le type du
// contrat consommateur. Retour discriminé — jamais de valeur de secours inventée.
// ─────────────────────────────────────────────────────────────────────────────

/** Résultat d'un parsing strict : soit la donnée validée, soit un échec qualifié. */
export type ParseOutcome<T> = { ok: true; value: T } | { ok: false };

/** `agents` normalisé depuis l'enveloppe ou le tableau nu. */
export function parseAgentList(json: unknown): ParseOutcome<PublishedAgent[]> {
  const r = ListAgentsResponseSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const agents = Array.isArray(r.data) ? r.data : r.data.agents;
  return { ok: true, value: agents as PublishedAgent[] };
}

/** `events` normalisé depuis l'enveloppe ou le tableau nu. */
export function parseEventList(json: unknown): ParseOutcome<RuntimeRunEvent[]> {
  const r = ListRunEventsResponseSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const events = Array.isArray(r.data) ? r.data : r.data.events;
  return { ok: true, value: events as RuntimeRunEvent[] };
}

/** Agent normalisé depuis `{ agent }` ou l'agent à plat. */
export function parseAgent(json: unknown): ParseOutcome<PublishedAgent> {
  const r = AgentDetailResponseSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const agent = "agent" in r.data ? r.data.agent : r.data;
  return { ok: true, value: agent as PublishedAgent };
}

/** Run normalisé depuis `{ run }` ou le run à plat. */
export function parseRun(json: unknown): ParseOutcome<RuntimeRun> {
  const r = RunEnvelopeResponseSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const run = "run" in r.data ? r.data.run : r.data;
  return { ok: true, value: run as RuntimeRun };
}

// Garde-fous de cohérence type↔schéma : si `runtime-types.ts` et ce module
// divergent, ces assignations cassent le typecheck (gate) au lieu de dériver
// silencieusement. Coût runtime nul (types uniquement).
type _AssertAgent = z.infer<typeof PublishedAgentSchema> extends PublishedAgent ? true : never;
type _AssertRun = z.infer<typeof RuntimeRunSchema> extends RuntimeRun ? true : never;
type _AssertEvent = z.infer<typeof RuntimeRunEventSchema> extends RuntimeRunEvent ? true : never;
type _AssertAgentsResp = ListAgentsResponse extends { agents: PublishedAgent[] } ? true : never;
type _AssertEventsResp = ListRunEventsResponse extends { events: RuntimeRunEvent[] } ? true : never;
// Consomme les alias (sinon lint "unused"). Valeurs = true par construction.
export const __schemaContract: [
  _AssertAgent,
  _AssertRun,
  _AssertEvent,
  _AssertAgentsResp,
  _AssertEventsResp,
] = [true, true, true, true, true];
