/**
 * POST /api/invest/token/{dealId}/reconcile — lance une passe de réconciliation.
 *
 * Compare Σ DEEP (inv_cap_table_entries, vérité I1) vs Σ chaîne (inv_chain_events)
 * via la règle PURE DEEP-gagne, écrit un inv_reconciliation_runs et renvoie l'issue.
 * Sans indexer chaîne → `legal_only` (DEEP seul, in_sync). chaîne>DEEP → `pause`.
 *
 * GARDE : 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/compliance.
 * Filtrage tenant_id explicite (I9). Fail-soft total. `{dealId}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { reconcile, supabaseTokenizationStore } from "@/lib/invest/tokenization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
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
    const result = await reconcile(supabaseTokenizationStore(), dealId, { tenantId });
    return NextResponse.json({ dealId, result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "reconcile_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
