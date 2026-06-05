import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { getSwarm, patchSwarm, deleteSwarm } from "@/lib/swarms/client"
import type { PatchSwarmPayload } from "@/lib/swarms/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/swarms/[id] ─────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    const swarm = await getSwarm(id)
    return NextResponse.json({ item: swarm })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "fetch_failed", detail: message }, { status: 500 })
  }
}

// ─── PATCH /api/swarms/[id] ───────────────────────────────────────────────────

export async function PATCH(req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params

  let body: PatchSwarmPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const swarm = await patchSwarm(id, body)
    return NextResponse.json({ item: swarm })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "patch_failed", detail: message }, { status: 500 })
  }
}

// ─── DELETE /api/swarms/[id] ──────────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    await deleteSwarm(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "delete_failed", detail: message }, { status: 500 })
  }
}
