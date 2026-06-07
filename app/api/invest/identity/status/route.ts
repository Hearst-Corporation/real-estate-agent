/**
 * GET /api/invest/identity/status — état consolidé KYC + ONCHAINID + whitelisting.
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - Filtrage user_id + tenant_id explicite (service-role, I9).
 * - Le statut on-chain (whitelisting ERC-3643) est tenté en FAIL-SOFT via
 *   l'IdentityRegistryPort : non configuré ou en erreur → `onchainVerified: null`
 *   (jamais une 5xx pour autant).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getIdentityRegistryPort } from "@/lib/invest/adapters";
import {
  supabaseInvestorStore,
  getIdentityStatus,
  type InvestorCtx,
} from "@/lib/invest/investor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const ctx: InvestorCtx = { userId: claims.sub, tenantId: tenantOf(claims) };

  try {
    const status = await getIdentityStatus(
      supabaseInvestorStore(),
      ctx,
      getIdentityRegistryPort(),
    );
    return NextResponse.json({ status });
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
