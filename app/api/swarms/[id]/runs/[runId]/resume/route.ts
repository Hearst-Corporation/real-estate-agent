import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { getSupabaseAdmin } from "@/lib/server/supabase"
import { getRunStatus, resumeRun } from "@/lib/swarms/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; runId: string }> }

// ─── POST /api/swarms/[id]/runs/[runId]/resume ────────────────────────────────
// Reprend un run en pause HITL après la décision humaine.

export async function POST(req: Request, { params }: Params) {
  const claims = await getSession()
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const ownerId = uuidOwnerOf(claims)
  const { id, runId } = await params

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 })

  // Parse body
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // corps vide ou invalide → body reste {}
  }

  const value = String(body.value ?? "").trim()
  if (!value) {
    return NextResponse.json({ error: "value_required" }, { status: 400 })
  }

  // Récupère la décision en attente depuis l'engine
  const run = await getRunStatus(id, runId, ownerId).catch(() => null)
  const pending = run?.decision ?? null
  const decisionId = (body.decision_id as string | undefined) ?? pending?.id

  if (!pending || !decisionId) {
    return NextResponse.json({ error: "no_pending_decision" }, { status: 409 })
  }

  // Appel engine + mise à jour DB
  try {
    await resumeRun(id, runId, ownerId, { decision_id: decisionId, value })

    await sb
      .from("swarm_runs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("tenant_id", ownerId)
  } catch (e) {
    // Vérifie si le moteur a quand même repris le run malgré l'erreur réseau
    const after = await getRunStatus(id, runId, ownerId).catch(() => null)
    if (after && after.status !== "paused_hitl") {
      // Le moteur a repris — on sync la DB et on continue normalement
      await sb
        .from("swarm_runs")
        .update({ status: after.status, updated_at: new Date().toISOString() })
        .eq("run_id", runId)
        .eq("tenant_id", ownerId)
    } else {
      return NextResponse.json({ error: "resume_failed" }, { status: 502 })
    }
  }

  return NextResponse.json({ ok: true })
}
