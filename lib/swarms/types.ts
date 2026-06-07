// ─── MySwarms — Types TS ─────────────────────────────────────────────────────

// Tool binding
export type ToolBinding = { tool_id: string; config?: Record<string, unknown> }

// Task
export type SwarmTask = {
  id?: string
  name: string
  description: string
  expected_output: string
  agent_name?: string
}

// Agent
export type SwarmAgent = {
  id?: string
  name: string
  role: string
  goal: string
  backstory?: string
  tools?: string[]
}

// Swarm (complet depuis l'engine)
export type Swarm = {
  id: string
  name: string
  description?: string
  owner_id: string | null // null = swarm seed/template global (visible par tous)
  is_active: boolean
  agents: SwarmAgent[]
  tasks: SwarmTask[]
  tool_bindings: ToolBinding[]
  created_at: string
  updated_at: string
}

// Create payload
export type CreateSwarmPayload = {
  name: string
  description?: string
  owner_id: string
  agents: SwarmAgent[]
  tasks: SwarmTask[]
  tool_bindings?: ToolBinding[]
}

// Patch payload
export type PatchSwarmPayload = Partial<Omit<CreateSwarmPayload, "owner_id">>

// Run
export type SwarmRunStatus = "pending" | "running" | "done" | "failed" | "error" | "paused_hitl"

/** Demande de décision émise par le moteur quand un run est en pause (HITL). */
export type SwarmRunDecision = {
  id?: string
  question: string
  hint?: string
  options: { value: string; label: string; sub?: string }[]
}

export type SwarmRun = {
  run_id: string
  swarm_id: string
  status: SwarmRunStatus
  output?: string
  steps?: SwarmStep[]
  // Décision en attente quand status === "paused_hitl" (sinon undefined).
  decision?: SwarmRunDecision
  created_at?: string
  updated_at?: string
  // Métriques d'exécution (engine) — affichées dans l'en-tête du rapport.
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number
}

// Step
export type SwarmStep = {
  id?: string
  agent?: string
  task?: string
  output?: string
  timestamp?: string
}

// Kickoff response
export type KickoffResponse = {
  run_id: string
  swarm_id: string
  status: SwarmRunStatus
}

// Architect spec
export type ArchitectSpec = {
  name: string
  description: string
  agents: SwarmAgent[]
  tasks: SwarmTask[]
  tool_bindings?: ToolBinding[]
}

// Tool from catalog
export type SwarmTool = {
  id: string
  name: string
  description?: string
  category?: string
}

// Swarm run local DB record
export type SwarmRunRecord = {
  id: string
  tenant_id: string
  user_id: string
  swarm_id: string
  run_id: string
  status: SwarmRunStatus
  result: unknown
  steps: SwarmStep[]
  created_at: string
  updated_at: string
}
