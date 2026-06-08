import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { getSupabaseAdmin } from "@/lib/server/supabase"
import { getRunStatus } from "@/lib/swarms/client"
import type { SwarmRunStatus } from "@/lib/swarms/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; runId: string }> }

// ─── GET /api/swarms/[id]/runs/[runId] ────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)
  const { id, runId } = await params

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 })

  // Lire le record local
  const { data: record, error: dbError } = await sb
    .from("swarm_runs")
    .select("*")
    .eq("run_id", runId)
    .eq("tenant_id", ownerId)
    .single()

  if (dbError || !record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Fetch le statut live depuis l'engine
  let engineRun = null
  try {
    engineRun = await getRunStatus(id, runId, ownerId)
  } catch {
    // L'engine peut être indisponible — on retourne le record local
  }

  // Merge + mise à jour DB si le statut a changé
  const liveStatus = (engineRun?.status ?? record.status) as SwarmRunStatus
  const liveSteps = engineRun?.steps ?? record.steps

  if (engineRun && engineRun.status !== record.status) {
    await sb
      .from("swarm_runs")
      .update({
        status: liveStatus,
        steps: liveSteps ? JSON.parse(JSON.stringify(liveSteps)) : null,
        result: engineRun.output ? engineRun.output : null,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("tenant_id", ownerId)
  }

  return NextResponse.json({
    run: {
      ...record,
      status: liveStatus,
      output: engineRun?.output ?? null,
      decision: engineRun?.decision ?? null,
      created_at: engineRun?.created_at ?? record.created_at,
      updated_at: engineRun?.updated_at ?? record.updated_at,
      tokens_in: engineRun?.tokens_in ?? null,
      tokens_out: engineRun?.tokens_out ?? null,
      cost_usd: engineRun?.cost_usd ?? null,
    },
    steps: liveSteps ?? [],
  })
}
