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
  owner_id: string
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
export type SwarmRunStatus = "pending" | "running" | "done" | "failed" | "error"

export type SwarmRun = {
  run_id: string
  swarm_id: string
  status: SwarmRunStatus
  output?: string
  steps?: SwarmStep[]
  created_at?: string
  updated_at?: string
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
