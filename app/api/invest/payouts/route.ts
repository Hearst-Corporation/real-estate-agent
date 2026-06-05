/**
 * GET /api/invest/payouts — MES payouts reçus (investisseur, Epic 1.5).
 *
 * Liste les versements (coupons / exit) reçus par le caller, tous deals confondus
 * mais JAMAIS agrégés en une valeur consolidée : chaque payout = une créance d'un
 * deal précis (anti-FIA L2, pas de NAV).
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - Filtrage user_id + tenant_id explicite (service-role, I9) ; assertion d'owner
 *   sur chaque ligne dans le CORE `listPayoutsForUser`.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { listPayoutsForUser } from "@/lib/invest/distribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  try {
    const items = await listPayoutsForUser({ tenantId, userId: claims.sub });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "list_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
