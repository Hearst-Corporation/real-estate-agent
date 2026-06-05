import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { tenantOf } from "@/lib/tenant"
import { listTools } from "@/lib/swarms/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─── GET /api/swarms/tools ────────────────────────────────────────────────────

export async function GET() {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = tenantOf(claims)

  try {
    const tools = await listTools(ownerId)
    return NextResponse.json({ items: tools })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "fetch_failed", detail: message }, { status: 500 })
  }
}
