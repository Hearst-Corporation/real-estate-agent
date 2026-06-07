/**
 * POST /api/invest/subscriptions/{id}/sign — déclenche la signature eIDAS (③).
 *
 * Exige une souscription `reserved` (sinon 422). Délègue à l'ESignaturePort
 * (Yousign). FAIL-SOFT : sans clé Yousign → 502 { error:"esign_not_configured" },
 * la souscription reste `reserved` (aucun faux succès). Le passage vers `signed`
 * se fait au WEBHOOK esign — pas ici.
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503 ; assertOwnership (service, I9).
 * - Idempotence (I8) : withIdempotency sur `esign:{subscriptionId}`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getESignaturePort } from "@/lib/invest/adapters";
import {
  supabaseSubscriptionStore,
  requestSignature,
  type SubscriptionCtx,
} from "@/lib/invest/subscription";
import {
  withIdempotency,
  hashBody,
  supabaseIdempotencyStore,
} from "@/lib/invest/shared/idempotency";
import {
  ComplianceBlockedError,
  InvariantViolationError,
  ProviderUnavailableError,
  IdempotencyConflictError,
} from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id: subId } = await params;
  const tenantId = tenantOf(claims);
  const ctx: SubscriptionCtx = { userId: claims.sub, tenantId, signerEmail: claims.email ?? null };

  const esign = getESignaturePort();
  // Fail-soft AVANT toute écriture : pas de clé Yousign → 502 explicite.
  if (!esign.isConfigured()) {
    return NextResponse.json({ error: "esign_not_configured" }, { status: 502 });
  }

  try {
    const { result } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      { key: `esign:${subId}`, bodyHash: hashBody({ subId }) },
      () =>
        requestSignature(supabaseSubscriptionStore(), ctx, esign, subId, {
          idempotencyKey: `esign:${subId}`,
        }),
    );
    return NextResponse.json({ signature: result }, { status: 200 });
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
      return NextResponse.json({ error: "esign_not_configured" }, { status: 502 });
    }
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "compliance_blocked", reason: e.reason }, { status: 422 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    if (e instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "sign_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
