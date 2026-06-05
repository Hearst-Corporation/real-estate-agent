/**
 * GET /api/invest/token/{dealId}/reconciliation — état de réconciliation DEEP↔chaîne.
 *
 * Renvoie le DERNIER run de réconciliation (inv_reconciliation_runs) pour le deal :
 * résultat (in_sync/mint_missing/chain_exceeds_deep), drift par porteur, et si une
 * PAUSE a été déclenchée (chaîne>DEEP → DEEP prime). Lecture seule, back-office.
 *
 * GARDE : 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/compliance.
 * Filtrage tenant_id explicite (I9). `{dealId}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const tenantId = tenantOf(claims);
  try {
    const { data, error } = await sb
      .from("inv_reconciliation_runs")
      .select("id, deal_id, bond_tranche_id, result, drift, actions, status, triggered_pause, started_at, finished_at")
      .eq("tenant_id", tenantId)
      .eq("deal_id", dealId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json(
      { dealId, source: "deep_authoritative", lastRun: data ?? null },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "reconciliation_read_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
