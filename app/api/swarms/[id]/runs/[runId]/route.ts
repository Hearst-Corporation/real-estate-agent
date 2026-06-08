import { NextResponse } from "next/server"
import { getSession } from "@/lib/server/session"
import { uuidOwnerOf } from "@/lib/tenant"
import { getSupabaseAdmin } from "@/lib/server/supabase"
import { getRunStatus } from "@/lib/swarms/client"
import type { SwarmRunStatus } from "@/lib/swarms/types"
import type { Database } from "@/lib/supabase/database.types"
import { TERMINAL_STATUSES, WEBHOOK_FRESH_MS } from "@/lib/swarms/constants"

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

  const recordStatus = record.status as SwarmRunStatus

  // ─── Optim : éviter le poll moteur si inutile ────────────────────────────
  // 1. Statut terminal → le run ne bougera plus, on sert le record DB.
  // 2. SWARMS_TRUST_WEBHOOK=true + record frais (<WEBHOOK_FRESH_MS) → le
  //    webhook vient de mettre à jour la DB, le poll moteur est redondant.
  const isTerminal = TERMINAL_STATUSES.includes(recordStatus as "done" | "failed" | "error")

  if (isTerminal) {
    // Sert directement le record DB sans poll moteur.
    // FIX P1-3b : les valeurs tokens/cost/decision viennent du record DB (persistés
    // par le webhook) au lieu d'être null en dur.
    return NextResponse.json({
      run: {
        ...record,
        status: recordStatus,
        output: record.result ?? null,
        decision: record.decision ?? null,
        tokens_in: record.tokens_in ?? null,
        tokens_out: record.tokens_out ?? null,
        cost_usd: record.cost_usd ?? null,
      },
      steps: record.steps ?? [],
    })
  }

  const trustWebhook = process.env.SWARMS_TRUST_WEBHOOK === "true"
  if (trustWebhook && record.updated_at) {
    const age = Date.now() - new Date(record.updated_at).getTime()
    if (age < WEBHOOK_FRESH_MS) {
      // Record frais — inutile de poller le moteur.
      // FIX P1-3b : idem — valeurs depuis DB.
      return NextResponse.json({
        run: {
          ...record,
          status: recordStatus,
          output: record.result ?? null,
          decision: record.decision ?? null,
          tokens_in: record.tokens_in ?? null,
          tokens_out: record.tokens_out ?? null,
          cost_usd: record.cost_usd ?? null,
        },
        steps: record.steps ?? [],
      })
    }
  }

  // Fetch le statut live depuis l'engine
  let engineRun = null
  try {
    engineRun = await getRunStatus(id, runId, ownerId)
  } catch {
    // L'engine peut être indisponible — on retourne le record local
  }

  // Merge + mise à jour DB si le statut a changé
  const liveStatus = (engineRun?.status ?? recordStatus) as SwarmRunStatus
  const liveSteps = engineRun?.steps ?? record.steps

  if (engineRun && engineRun.status !== record.status) {
    // FIX P1-3b : persiste aussi tokens/cost/decision depuis engineRun lors du poll
    type SwarmRunUpdate = Database["public"]["Tables"]["swarm_runs"]["Update"]
    const pollUpdate: SwarmRunUpdate = {
      status: liveStatus,
      steps: liveSteps ? JSON.parse(JSON.stringify(liveSteps)) : null,
      result: engineRun.output ? engineRun.output : null,
      updated_at: new Date().toISOString(),
      // decision : null = pas de pause HITL active (efface la valeur précédente)
      decision: (engineRun.decision ?? null) as Database["public"]["Tables"]["swarm_runs"]["Update"]["decision"],
    }
    if (engineRun.tokens_in !== undefined) pollUpdate.tokens_in = engineRun.tokens_in
    if (engineRun.tokens_out !== undefined) pollUpdate.tokens_out = engineRun.tokens_out
    if (engineRun.cost_usd !== undefined) pollUpdate.cost_usd = engineRun.cost_usd
    await sb
      .from("swarm_runs")
      .update(pollUpdate)
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
