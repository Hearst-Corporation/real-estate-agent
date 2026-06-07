/**
 * POST /api/invest/subscriptions/{id}/cancel — annulation / rétractation (ECSP).
 *
 * - `reserved`/`signed` (avant versement) → annulé / rétracté, sans condition de délai.
 * - `funded` (fonds en séquestre) → autorisé UNIQUEMENT pendant le délai de
 *   réflexion 4j → remboursement INTÉGRAL via EscrowPort.refund (→ `refunded`).
 *   Hors délai → 422 { reason:"cooling_off_expired" }.
 *
 * Transition pilotée par la machine PURE (cancel/withdraw/refund), jamais par le
 * client. - getSession() → 401 ; getSupabaseAdmin() → 503 ; assertOwnership (I9).
 * Idempotence (I8) : `cancel:{subscriptionId}` (le refund tiers est idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getEscrowPort } from "@/lib/invest/adapters";
import {
  supabaseSubscriptionStore,
  cancel,
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
  const escrow = getEscrowPort();

  try {
    const { result } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      { key: `cancel:${subId}`, bodyHash: hashBody({ subId }) },
      () =>
        cancel(supabaseSubscriptionStore(), ctx, subId, escrow, {
          idempotencyKey: `refund:${subId}`,
        }),
    );
    return NextResponse.json({ subscription: result }, { status: 200 });
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
      // Refund requis mais séquestre non configuré → 502 (la souscription reste funded).
      return NextResponse.json({ error: "escrow_not_configured" }, { status: 502 });
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
      { error: "cancel_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
