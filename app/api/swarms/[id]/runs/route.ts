import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { getSupabaseAdmin } from "@/lib/server/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RUNS_LIMIT = 20

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/swarms/[id]/runs ────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)
  const { id } = await params

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 })

  const { data, error } = await sb
    .from("swarm_runs")
    .select("*")
    .eq("swarm_id", id)
    .eq("tenant_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(RUNS_LIMIT)

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
