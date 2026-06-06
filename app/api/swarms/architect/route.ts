import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { generateSpec } from "@/lib/swarms/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

// ─── POST /api/swarms/architect ───────────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)

  let body: { description?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  if (!body.description || typeof body.description !== "string" || body.description.trim() === "") {
    return NextResponse.json({ error: "invalid_body", detail: "description is required" }, { status: 400 })
  }

  try {
    const raw = await generateSpec(body.description.trim(), ownerId) as unknown as {
      spec: { name: string; description?: string; agents: unknown[]; tasks: unknown[]; tool_bindings?: unknown[] }
      rationale?: string
    }
    // L'engine retourne { spec: { name, agents, tasks, ... }, rationale, ... }
    // On normalise en extrayant le sous-objet spec
    const spec = raw?.spec ?? raw
    return NextResponse.json({ spec })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "architect_failed", detail: message }, { status: 500 })
  }
}
