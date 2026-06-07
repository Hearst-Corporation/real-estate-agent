/**
 * POST /api/invest/kyc/start — démarre un cas KYC (WF-2).
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - Idempotent (I8) : withIdempotency sur la clé déterministe `kyc:{userId}` →
 *   un double-clic renvoie la réponse mémorisée sans relancer Sumsub.
 * - FAIL-SOFT : si Sumsub n'est pas configuré (clés absentes), 502
 *   { error: "kyc_not_configured" } — aucun appel réseau tenté.
 * - Filtrage user_id + tenant_id explicite (service-role, I9).
 *
 * Le webhook (POST /api/invest/webhooks/kyc) fera ensuite avancer l'état.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { getKycPort } from "@/lib/invest/adapters";
import {
  supabaseInvestorStore,
  startKyc,
  type InvestorCtx,
} from "@/lib/invest/investor";
import {
  withIdempotency,
  hashBody,
  supabaseIdempotencyStore,
} from "@/lib/invest/shared/idempotency";
import { ProviderUnavailableError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  level: z.enum(["standard", "enhanced"]).default("standard"),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const kyc = getKycPort();
  // Fail-soft AVANT toute écriture : pas de clé Sumsub → 502 explicite.
  if (!kyc.isConfigured()) {
    return NextResponse.json({ error: "kyc_not_configured" }, { status: 502 });
  }

  const tenantId = tenantOf(claims);
  const ctx: InvestorCtx = { userId: claims.sub, tenantId };
  const { level } = parsed.data;

  try {
    const { result } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      { key: `kyc:${claims.sub}`, bodyHash: hashBody({ level }) },
      () => startKyc(supabaseInvestorStore(), ctx, kyc, { level }),
    );
    return NextResponse.json(
      {
        kycCaseId: result.kycCaseId,
        providerCaseId: result.providerCaseId,
        sdkToken: result.sdkToken,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
      return NextResponse.json({ error: "kyc_not_configured" }, { status: 502 });
    }
    return NextResponse.json(
      { error: "kyc_start_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
