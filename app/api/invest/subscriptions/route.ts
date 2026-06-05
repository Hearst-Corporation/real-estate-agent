/**
 * GET /api/invest/subscriptions — mes souscriptions (P5).
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - Filtrage user_id + tenant_id explicite + assertOwnership (service, I9).
 * - Renvoie chaque souscription avec son statut, le délai de réflexion et les
 *   actions contextuelles applicables (machine pure : signer / annuler…).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseSubscriptionStore,
  listMySubscriptions,
  type SubscriptionCtx,
} from "@/lib/invest/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const ctx: SubscriptionCtx = { userId: claims.sub, tenantId };

  try {
    const items = await listMySubscriptions(supabaseSubscriptionStore(), ctx);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
