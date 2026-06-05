import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { tenantOf } from "@/lib/tenant"
import { generateSpec } from "@/lib/swarms/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─── POST /api/swarms/architect ───────────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = tenantOf(claims)

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
    const spec = await generateSpec(body.description.trim(), ownerId)
    return NextResponse.json({ spec })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "architect_failed", detail: message }, { status: 500 })
  }
}
