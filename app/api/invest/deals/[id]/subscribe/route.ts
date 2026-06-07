/**
 * POST /api/invest/deals/{id}/subscribe — soft-commit NON ENGAGEANT (P5, I2/I3).
 *
 * Crée une souscription `reserved` (AUCUN versement, révocable, exclue du raised
 * côté SQL — anti-FIA). Gardes serveur (dans createSoftCommit) : deal `open`,
 * KYC approuvé, suitability (averti OU test ECSP), ticket ∈ [min,max], plafond
 * ECSP 12 mois glissants.
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - Idempotence (I8) : withIdempotency sur `subscribe:{userId}:{dealId}:{hash}`.
 * - Filtrage user_id + tenant_id explicite (service-role, I9).
 * - Blocages conformité → 422 { error:"compliance_blocked", reason }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseSubscriptionStore,
  createSoftCommit,
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
  IdempotencyConflictError,
} from "@/lib/invest/shared/errors";
import { recordAudit } from "@/lib/invest/shared/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  amountEur: z.number().positive().finite(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id: dealId } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tenantId = tenantOf(claims);
  const ctx: SubscriptionCtx = { userId: claims.sub, tenantId, signerEmail: claims.email ?? null };
  const { amountEur } = parsed.data;

  try {
    const { result } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      {
        key: `subscribe:${claims.sub}:${dealId}:${hashBody({ amountEur })}`,
        bodyHash: hashBody({ amountEur }),
      },
      () => createSoftCommit(supabaseSubscriptionStore(), ctx, dealId, amountEur),
    );
    // Audit additif (best-effort, ne casse jamais la souscription).
    await recordAudit(sb, {
      tenantId,
      action: "subscription.created",
      actorUserId: claims.sub,
      actorRole: claims.role,
      entityType: "inv_subscription",
      entityId: result.id,
      after: { dealId, status: result.status, amountEur: result.amountEur, units: result.units },
    });
    return NextResponse.json({ subscription: result }, { status: 201 });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "compliance_blocked", reason: e.reason }, { status: 422 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "invalid_request", detail: e.message }, { status: 400 });
    }
    if (e instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "subscribe_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
