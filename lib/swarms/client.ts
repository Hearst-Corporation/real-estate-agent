// ─── MySwarms — Client HTTP vers l'engine ────────────────────────────────────
import type {
  Swarm,
  CreateSwarmPayload,
  PatchSwarmPayload,
  KickoffResponse,
  SwarmRun,
  ArchitectSpec,
  SwarmTool,
} from "./types"

const ENGINE_ROOT = process.env.MYSWARMS_ENGINE_URL?.replace(/\/+$/, "") ?? ""
const ENGINE_BASE = ENGINE_ROOT ? `${ENGINE_ROOT}/v1` : ""
const ENGINE_TOKEN = process.env.MYSWARMS_ENGINE_TOKEN ?? ""
const DEFAULT_TIMEOUT_MS = 30_000

export class SwarmsEngineUnavailableError extends Error {
  constructor(message = "myswarms_engine_unavailable") {
    super(message)
    this.name = "SwarmsEngineUnavailableError"
  }
}

// ─── Helper interne ──────────────────────────────────────────────────────────

async function engineFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {}

  if (!ENGINE_BASE || !ENGINE_TOKEN) {
    throw new SwarmsEngineUnavailableError()
  }

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

export async function getSwarm(swarmId: string): Promise<Swarm> {
  return engineFetch<Swarm>(`/swarms/${encodeURIComponent(swarmId)}`)
}

export async function patchSwarm(
  swarmId: string,
  payload: PatchSwarmPayload
): Promise<Swarm> {
  return engineFetch<Swarm>(`/swarms/${encodeURIComponent(swarmId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteSwarm(swarmId: string): Promise<void> {
  return engineFetch<void>(`/swarms/${encodeURIComponent(swarmId)}`, {
    method: "DELETE",
  })
}

export async function kickoffSwarm(swarmId: string): Promise<KickoffResponse> {
  return engineFetch<KickoffResponse>(
    `/swarms/${encodeURIComponent(swarmId)}/kickoff`,
    { method: "POST", body: JSON.stringify({}) }
  )
}

export async function getRunStatus(
  swarmId: string,
  runId: string
): Promise<SwarmRun> {
  return engineFetch<SwarmRun>(
    `/swarms/${encodeURIComponent(swarmId)}/runs/${encodeURIComponent(runId)}`
  )
}

export async function listSwarmRuns(
  swarmId: string,
  ownerId: string,
  limit = 20
): Promise<SwarmRun[]> {
  return engineFetch<SwarmRun[]>(
    `/swarms/${encodeURIComponent(swarmId)}/runs?owner_id=${encodeURIComponent(ownerId)}&limit=${limit}`
  )
}

export async function getRun(runId: string): Promise<SwarmRun> {
  return engineFetch<SwarmRun>(`/runs/${encodeURIComponent(runId)}`)
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
