import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { getSupabaseAdmin } from "@/lib/server/supabase"
import { kickoffSwarm } from "@/lib/swarms/client"
import { rateLimit } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KICKOFF_RL_MAX = 10
const KICKOFF_RL_WINDOW_S = 60

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/swarms/[id]/kickoff ────────────────────────────────────────────

export async function POST(_req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)
  const { id } = await params

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 })

  if (!(await rateLimit(`kickoff:${claims.sub}`, KICKOFF_RL_MAX, KICKOFF_RL_WINDOW_S))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  try {
    const result = await kickoffSwarm(id, ownerId)

    // Persist dans swarm_runs
    const { error: dbError } = await sb.from("swarm_runs").insert({
      tenant_id: ownerId,
      user_id: claims.sub,
      swarm_id: id,
      run_id: result.run_id,
      status: result.status,
    })

    if (dbError) {
      // On log l'erreur mais on ne bloque pas — le kickoff a réussi côté engine
      console.error("[swarms/kickoff] persist error:", dbError.message)
    }

    return NextResponse.json(
      { runId: result.run_id, swarmId: result.swarm_id, status: result.status },
      { status: 202 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: "kickoff_failed", detail: message }, { status: 500 })
  }
}
