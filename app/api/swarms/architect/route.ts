import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { generateSpec } from "@/lib/swarms/client"
import { rateLimit } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const ARCHITECT_RL_MAX = 10
const ARCHITECT_RL_WINDOW_S = 60

// ─── POST /api/swarms/architect ───────────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)

  if (!(await rateLimit(`architect:${claims.sub}`, ARCHITECT_RL_MAX, ARCHITECT_RL_WINDOW_S))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

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
