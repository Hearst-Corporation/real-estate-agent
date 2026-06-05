/**
 * POST /api/invest/subscriptions/{id}/fund — instruit le versement vers le
 * SÉQUESTRE TIERS (P10, I4). La plateforme ne détient JAMAIS les fonds.
 *
 * Exige une souscription `signed` (sinon 422). Délègue à EscrowPort
 * .createDepositInstruction (séquestre PAR DEAL) et pose le délai de réflexion 4j
 * (cooling_off_ends_at). FAIL-SOFT : sans clé EMI/notaire → 502
 * { error:"escrow_not_configured" }, la souscription reste `signed`. Le passage
 * vers `funded` se fait au WEBHOOK escrow — pas ici.
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503 ; assertOwnership (service, I9).
 * - Idempotence (I8) : withIdempotency sur `escrow:{subscriptionId}`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getEscrowPort } from "@/lib/invest/adapters";
import {
  supabaseSubscriptionStore,
  instructFunding,
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
import { recordAudit } from "@/lib/invest/shared/audit";

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
  // Fail-soft AVANT toute écriture : pas de clé séquestre → 502 explicite.
  if (!escrow.isConfigured()) {
    return NextResponse.json({ error: "escrow_not_configured" }, { status: 502 });
  }

  try {
    const { result } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      { key: `escrow:${subId}`, bodyHash: hashBody({ subId }) },
      () =>
        instructFunding(supabaseSubscriptionStore(), ctx, escrow, subId, {
          idempotencyKey: `escrow:${subId}`,
        }),
    );
    // Audit additif (best-effort, ne casse jamais l'instruction de versement).
    await recordAudit(sb, {
      tenantId,
      action: "subscription.funding_instructed",
      actorUserId: claims.sub,
      actorRole: claims.role,
      entityType: "inv_subscription",
      entityId: subId,
      after: { providerRef: result.providerRef, coolingOffEndsAt: result.coolingOffEndsAt },
    });
    return NextResponse.json({ funding: result }, { status: 200 });
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
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
      { error: "fund_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
