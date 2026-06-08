// ─── MySwarms — Client HTTP vers l'engine ────────────────────────────────────
import type {
  Swarm,
  CreateSwarmPayload,
  PatchSwarmPayload,
  KickoffResponse,
  SwarmRun,
  SwarmRunDecision,
  SwarmRunStatus,
  SwarmStep,
  ArchitectSpec,
  SwarmTool,
} from "./types"

const ENGINE_BASE = `${process.env.MYSWARMS_ENGINE_URL ?? ""}/v1`
const ENGINE_TOKEN = process.env.MYSWARMS_ENGINE_TOKEN ?? ""
const DEFAULT_TIMEOUT_MS = 30_000

// ─── Helper interne ──────────────────────────────────────────────────────────

async function engineFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {}

  const url = `${ENGINE_BASE}${path}`
  const headers = new Headers(fetchInit.headers as HeadersInit | undefined)
  headers.set("Authorization", `Bearer ${ENGINE_TOKEN}`)
  headers.set("Content-Type", "application/json")

  const signal = AbortSignal.timeout(timeoutMs)

  const res = await fetch(url, { ...fetchInit, headers, signal })

  if (!res.ok) {
    // Scrub l'URL (ne pas loguer le token)
    throw new Error(`engine error ${res.status} on ${path}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// ─── Normalisation run engine → type app ─────────────────────────────────────
// L'engine renvoie des champs distincts de SwarmRun (id/result_text/output_text,
// statut "completed", endpoint plat /runs/{id}). On normalise pour l'UI.

export function mapRunStatus(s: unknown): SwarmRunStatus {
  switch (s) {
    case "completed":
      return "done"
    case "queued":
      return "pending"
    case "cancelled":
    case "canceled":
      return "error"
    case "paused_hitl":
    case "pending":
    case "running":
    case "done":
    case "failed":
    case "error":
      return s
    default:
      return "running"
  }
}

function normalizeDecision(raw: unknown): SwarmRunDecision | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const d = raw as Record<string, unknown>
  const question = typeof d.question === "string" ? d.question : ""
  if (!question || !Array.isArray(d.options)) return undefined
  const options = (d.options as unknown[])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      value: String(o.value ?? ""),
      label: String(o.label ?? o.value ?? ""),
      sub: typeof o.sub === "string" ? o.sub : undefined,
    }))
    .filter((o) => o.value)
  if (!options.length) return undefined
  return {
    id: typeof d.id === "string" ? d.id : undefined,
    question,
    hint: typeof d.hint === "string" ? d.hint : undefined,
    options,
  }
}

function normalizeStep(st: Record<string, unknown>): SwarmStep {
  return {
    id: (st.id as string | undefined) ?? undefined,
    agent: (st.agent_name ?? st.agent) as string | undefined,
    task: (st.task_name ?? st.task) as string | undefined,
    output: (st.output_text ?? st.output) as string | undefined,
    timestamp: (st.created_at ?? st.timestamp) as string | undefined,
  }
}

export function normalizeRun(raw: Record<string, unknown>): SwarmRun {
  const steps = Array.isArray(raw.steps)
    ? (raw.steps as Record<string, unknown>[]).map(normalizeStep)
    : undefined
  return {
    run_id: (raw.run_id ?? raw.id) as string,
    swarm_id: raw.swarm_id as string,
    status: mapRunStatus(raw.status),
    output: (raw.result_text ?? raw.output) as string | undefined,
    decision: normalizeDecision(raw.decision),
    steps,
    created_at: (raw.started_at ?? raw.created_at) as string | undefined,
    updated_at: (raw.finished_at ?? raw.updated_at) as string | undefined,
    tokens_in: (raw.total_tokens_in ?? raw.tokens_in) as number | undefined,
    tokens_out: (raw.total_tokens_out ?? raw.tokens_out) as number | undefined,
    cost_usd: (raw.total_cost_usd ?? raw.cost_usd) as number | undefined,
  }
}

// ─── API publique ────────────────────────────────────────────────────────────

export async function listSwarms(ownerId: string): Promise<Swarm[]> {
  return engineFetch<Swarm[]>(`/swarms?owner_id=${encodeURIComponent(ownerId)}`)
}

export async function createSwarm(payload: CreateSwarmPayload): Promise<Swarm> {
  return engineFetch<Swarm>("/swarms", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

// L'engine exige owner_id (query) sur TOUS les endpoints par-swarm — sinon 400.
export async function getSwarm(swarmId: string, ownerId: string): Promise<Swarm> {
  return engineFetch<Swarm>(
    `/swarms/${encodeURIComponent(swarmId)}?owner_id=${encodeURIComponent(ownerId)}`
  )
}

export async function patchSwarm(
  swarmId: string,
  payload: PatchSwarmPayload,
  ownerId: string
): Promise<Swarm> {
  return engineFetch<Swarm>(
    `/swarms/${encodeURIComponent(swarmId)}?owner_id=${encodeURIComponent(ownerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  )
}

export async function deleteSwarm(swarmId: string, ownerId: string): Promise<void> {
  return engineFetch<void>(
    `/swarms/${encodeURIComponent(swarmId)}?owner_id=${encodeURIComponent(ownerId)}`,
    {
      method: "DELETE",
    }
  )
}

export async function kickoffSwarm(
  swarmId: string,
  ownerId: string,
  inputs?: Record<string, unknown>
): Promise<KickoffResponse> {
  // `inputs` est propagé jusqu'au crew (state.inputs) côté moteur — c'est le
  // canal pour lancer une mission ciblée et réinjecter les réponses humaines
  // entre deux sous-runs (le moteur ne fait que de l'atomique).
  return engineFetch<KickoffResponse>(
    `/swarms/${encodeURIComponent(swarmId)}/kickoff?owner_id=${encodeURIComponent(ownerId)}`,
    { method: "POST", body: JSON.stringify(inputs && Object.keys(inputs).length ? { inputs } : {}) }
  )
}

export async function getRunStatus(
  swarmId: string,
  runId: string,
  ownerId: string
): Promise<SwarmRun> {
  // L'engine expose le run sur un endpoint PLAT (/runs/{id}) — le nested
  // /swarms/{id}/runs/{id} n'existe pas (404). swarmId conservé pour compat.
  void swarmId
  return getRun(runId, ownerId)
}

export async function listSwarmRuns(
  swarmId: string,
  ownerId: string,
  limit = 20
): Promise<SwarmRun[]> {
  const raw = await engineFetch<Record<string, unknown>[]>(
    `/swarms/${encodeURIComponent(swarmId)}/runs?owner_id=${encodeURIComponent(ownerId)}&limit=${limit}`
  )
  return Array.isArray(raw) ? raw.map(normalizeRun) : []
}

export async function getRun(runId: string, ownerId: string): Promise<SwarmRun> {
  const raw = await engineFetch<Record<string, unknown>>(
    `/runs/${encodeURIComponent(runId)}?owner_id=${encodeURIComponent(ownerId)}`
  )
  return normalizeRun(raw)
}

/**
 * Reprend un run en pause HITL après la réponse de l'humain (moment de décision).
 * Cible le MÊME run (pas un nouveau kickoff) : le moteur réinjecte la `value`,
 * repasse le run en `running` et reprend à la task suivante. 202, idempotent.
 */
export async function resumeRun(
  swarmId: string,
  runId: string,
  ownerId: string,
  body: { decision_id: string; value: string }
): Promise<{ run_id: string; swarm_id: string; status: string }> {
  return engineFetch(
    `/swarms/${encodeURIComponent(swarmId)}/runs/${encodeURIComponent(runId)}/resume?owner_id=${encodeURIComponent(ownerId)}`,
    { method: "POST", body: JSON.stringify(body) }
  )
}

export async function generateSpec(
  description: string,
  ownerId: string
): Promise<ArchitectSpec> {
  return engineFetch<ArchitectSpec>("/swarms/architect/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: description, owner_id: ownerId }),
    timeoutMs: 90_000, // LLM generation can take 60-90s
  })
}

export async function listTools(ownerId: string): Promise<SwarmTool[]> {
  return engineFetch<SwarmTool[]>(
    `/tools?owner_id=${encodeURIComponent(ownerId)}`
  )
}
