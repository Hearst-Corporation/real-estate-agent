import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { listSwarms, createSwarm } from "@/lib/swarms/client"
import type { CreateSwarmPayload } from "@/lib/swarms/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─── GET /api/swarms ──────────────────────────────────────────────────────────

export async function GET() {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)

  try {
    const swarms = await listSwarms(ownerId)
    return NextResponse.json({ items: swarms })
  } catch {
    return NextResponse.json({ items: [] })
  }
}

// ─── POST /api/swarms ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "invalid_body", detail: "name is required" }, { status: 400 })
  }

  const payload: CreateSwarmPayload = {
    name: (body.name as string).trim(),
    description: body.description as string | undefined,
    owner_id: ownerId,
    agents: (body.agents as CreateSwarmPayload["agents"]) ?? [],
    tasks: (body.tasks as CreateSwarmPayload["tasks"]) ?? [],
    tool_bindings: body.tool_bindings as CreateSwarmPayload["tool_bindings"] | undefined,
  }

  try {
    const swarm = await createSwarm(payload)
    return NextResponse.json({ item: swarm }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "create_failed", detail: message }, { status: 500 })
  }
}
