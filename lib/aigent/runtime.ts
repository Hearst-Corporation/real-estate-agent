import "server-only";

import {
  RUNTIME_PROJECT_KEY,
  type ListAgentsResponse,
  type ListRunEventsResponse,
  type PublishedAgent,
  type RuntimeAvailability,
  type RuntimeResult,
  type RuntimeResumeDecision,
  type RuntimeRun,
  type RuntimeRunEvent,
} from "@/lib/aigent/runtime-types";

/**
 * Client du REGISTRE RUNTIME Aigent — server-only, feature-détecté (OUTBOUND).
 * =================================================================
 *
 * Consomme le contrat `/api/runtime/v1/**` d'Aigent (voir AIGENT_RUNTIME_CONTRACT.md).
 * Ce module ne FABRIQUE JAMAIS d'agent, de run ni de résultat — il propage l'état
 * réel du registre (liste vide / 404 / unavailable). Le token runtime vit
 * UNIQUEMENT côté serveur (jamais renvoyé ni loggé, jamais exposé au navigateur).
 *
 * Feature-detection : sans `AIGENT_RUNTIME_BASE_URL` + `AIGENT_RUNTIME_TOKEN`,
 * `runtimeAvailability()` renvoie `{ available:false, reason:"not_configured" }`
 * et AUCUN appel n'émet de requête réseau (retour `unavailable`). C'est l'état
 * honnête et attendu tant qu'Aigent n'est pas raccordé.
 *
 * Robustesse : fail-soft. Toute défaillance transport renvoie un `RuntimeResult`
 * qualifié (`unavailable`/`error`/`notFound`/`conflict`), jamais un throw non géré.
 */

/** Timeout par requête (ms). Non-magique : lu de l'env avec un défaut borné. */
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.AIGENT_RUNTIME_TIMEOUT_MS ?? "10000",
  10,
);

function baseUrl(): string | null {
  const raw = process.env.AIGENT_RUNTIME_BASE_URL?.trim();
  if (!raw) return null;
  // Normalise : retire un éventuel slash final pour composer proprement.
  return raw.replace(/\/+$/, "");
}

function token(): string | null {
  const raw = process.env.AIGENT_RUNTIME_TOKEN?.trim();
  return raw ? raw : null;
}

/** Vrai si la configuration minimale du registre runtime est présente. */
export function isRuntimeConfigured(): boolean {
  return Boolean(baseUrl() && token());
}

/**
 * Feature-detection sans requête réseau. `available:false` est un état de
 * première classe (honnête). N'émet AUCUN appel — la vraie joignabilité se
 * découvre au premier appel réel (qui, en cas d'échec, renvoie `unavailable`).
 */
export function runtimeAvailability(): RuntimeAvailability {
  if (!isRuntimeConfigured()) return { available: false, reason: "not_configured" };
  return { available: true };
}

/** Génère un identifiant de corrélation (`x-request-id`, contrat §3). */
function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Exécute un appel authentifié vers le registre runtime, avec timeout et parsing
 * JSON défensif. Ne renvoie JAMAIS `err.message` d'une dépendance interne — les
 * détails restent en `console.error` serveur (contrat §10).
 *
 * `expectOk` : liste des codes traités comme succès (défaut 200/201).
 */
async function call<T>(
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    requestId?: string;
  } = {},
  map?: (json: unknown) => T,
): Promise<RuntimeResult<T>> {
  const avail = runtimeAvailability();
  if (!avail.available) return { ok: false, unavailable: avail };

  const base = baseUrl();
  const tok = token();
  // Redondant avec runtimeAvailability, mais rassure le typage (null-narrowing).
  if (!base || !tok) return { ok: false, unavailable: { available: false, reason: "not_configured" } };

  const requestId = init.requestId ?? newRequestId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${tok}`,
        "x-request-id": requestId,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unavailable: { available: false, reason: "unauthorized" } };
    }
    if (res.status === 503) {
      // Registre configuré mais pas encore branché côté Aigent (token absent, etc).
      return { ok: false, unavailable: { available: false, reason: "not_provisioned" } };
    }
    if (res.status === 404) {
      return { ok: false, notFound: true };
    }
    if (res.status === 409) {
      return { ok: false, conflict: true };
    }
    if (!res.ok) {
      // Détail complet serveur uniquement ; réponse générique côté appelant.
      console.error("aigent_runtime_http_error", { path, status: res.status, requestId });
      return { ok: false, error: "runtime_error" };
    }

    const json: unknown = await res.json().catch(() => null);
    const data = map ? map(json) : (json as T);
    return { ok: true, data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("aigent_runtime_call_failed", { path, requestId, aborted });
    return { ok: false, unavailable: { available: false, reason: aborted ? "unreachable" : "error" } };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Appels du contrat (§12). Chaque appel propage l'état RÉEL du registre.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `GET /projects/:projectKey/agents` — liste des agents publiés du projet.
 * État réel actuel du registre : `{ ok:true, agents:[] }` (vide, honnête).
 */
export async function listAgents(
  projectKey: string = RUNTIME_PROJECT_KEY,
  requestId?: string,
): Promise<RuntimeResult<PublishedAgent[]>> {
  return call<PublishedAgent[]>(
    `/api/runtime/v1/projects/${encodeURIComponent(projectKey)}/agents`,
    { requestId },
    (json) => {
      const body = json as Partial<ListAgentsResponse> | null;
      // Ne fabrique rien : si le registre ne renvoie pas de tableau, c'est vide.
      return Array.isArray(body?.agents) ? body!.agents : [];
    },
  );
}

/** `GET /agents/:agentId` — détail d'un agent publié (404 si non matérialisé). */
export async function getAgent(
  agentId: string,
  requestId?: string,
): Promise<RuntimeResult<PublishedAgent>> {
  return call<PublishedAgent>(
    `/api/runtime/v1/agents/${encodeURIComponent(agentId)}`,
    { requestId },
    (json) => {
      const body = json as { agent?: PublishedAgent } | PublishedAgent | null;
      // Contrat §10 : succès = `{ ok:true, ...ressource }`. On accepte les deux
      // formes (`{agent}` ou l'agent à plat) sans jamais inventer de champ.
      return (body && "agent" in body ? body.agent : (body as PublishedAgent)) ?? ({} as PublishedAgent);
    },
  );
}

/**
 * `POST /agents/:agentId/runs` — crée un run (contrat §4/§6). `Idempotency-Key`
 * permet un retry réseau sans dupliquer l'exécution. État réel : 404 (skeleton).
 */
export async function createRun(
  agentId: string,
  input: unknown,
  idempotencyKey?: string,
  requestId?: string,
): Promise<RuntimeResult<RuntimeRun>> {
  return call<RuntimeRun>(
    `/api/runtime/v1/agents/${encodeURIComponent(agentId)}/runs`,
    {
      method: "POST",
      body: { input },
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      requestId,
    },
    (json) => extractRun(json),
  );
}

/** `GET /runs/:runId` — état d'un run (queued/running/waiting_on_input/…). */
export async function getRun(
  runId: string,
  requestId?: string,
): Promise<RuntimeResult<RuntimeRun>> {
  return call<RuntimeRun>(
    `/api/runtime/v1/runs/${encodeURIComponent(runId)}`,
    { requestId },
    (json) => extractRun(json),
  );
}

/**
 * `GET /runs/:runId/events?after=<sequence>` — événements ordonnés (contrat §6).
 * `after` = curseur de polling ; ne renvoie que `sequence > after`.
 */
export async function getRunEvents(
  runId: string,
  after?: number,
  requestId?: string,
): Promise<RuntimeResult<RuntimeRunEvent[]>> {
  const q = typeof after === "number" && Number.isFinite(after) ? `?after=${after}` : "";
  return call<RuntimeRunEvent[]>(
    `/api/runtime/v1/runs/${encodeURIComponent(runId)}/events${q}`,
    { requestId },
    (json) => {
      const body = json as Partial<ListRunEventsResponse> | null;
      return Array.isArray(body?.events) ? body!.events : [];
    },
  );
}

/**
 * `POST /runs/:runId/resume` — reprend un run `waiting_on_input` avec la décision
 * humaine (HITL, contrat §7). 409 si le run n'est pas en attente d'input.
 */
export async function resumeRun(
  runId: string,
  decision: RuntimeResumeDecision,
  requestId?: string,
): Promise<RuntimeResult<RuntimeRun>> {
  return call<RuntimeRun>(
    `/api/runtime/v1/runs/${encodeURIComponent(runId)}/resume`,
    { method: "POST", body: { decision }, requestId },
    (json) => extractRun(json),
  );
}

/**
 * Extrait un `RuntimeRun` d'une réponse contrat `{ ok:true, run:{…} }` ou d'un run
 * à plat. Ne fabrique aucun champ — retourne un objet minimal si la forme est
 * inattendue (jamais un faux run « fonctionnel »).
 */
function extractRun(json: unknown): RuntimeRun {
  const body = json as { run?: RuntimeRun } | RuntimeRun | null;
  const run = body && typeof body === "object" && "run" in body ? body.run : (body as RuntimeRun);
  return (run ?? {}) as RuntimeRun;
}
