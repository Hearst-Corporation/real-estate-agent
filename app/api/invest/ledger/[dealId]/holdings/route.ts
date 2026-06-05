/**
 * GET /api/invest/ledger/{dealId}/holdings — cap table off-chain agrégée (DEEP).
 *
 * Registre LÉGAL (inv_cap_table_entries) = SOURCE DE VÉRITÉ (I1). Renvoie l'état
 * courant des positions (units par porteur). Lecture back-office.
 *
 * GARDE : 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/compliance.
 * Filtrage tenant_id explicite (I9). `{dealId}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getHoldings, supabaseLedgerStore } from "@/lib/invest/ledger";

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
    const holdings = await getHoldings(supabaseLedgerStore(), dealId, tenantId);
    return NextResponse.json({ source: "deep", dealId, holdings }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "holdings_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
