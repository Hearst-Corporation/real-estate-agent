/**
 * GET   /api/invest/deals/{id}  — fiche deal + DealSheet (moteur), GATE KYC.
 * PATCH /api/invest/deals/{id}  — met à jour un deal (OPÉRATEUR/ADMIN).
 *
 * `{id}` accepte le SLUG (route publique de la fiche) ou l'UUID du deal. La fiche
 * investisseur résout par slug puis par id ; le PATCH back-office par id.
 *
 * GATE KYC : si le viewer n'est pas KYC-approuvé (inv_investor_profiles.kyc_status
 * ≠ 'approved'), les chiffres financiers DÉTAILLÉS du DealSheet sont neutralisés
 * (cf. gateDealSheet) — la structure reste visible (use of funds, LTV, dette/equity).
 *
 * Gardes : 401 sans session ; 503 sans Supabase ; 403 si PATCH non opérateur ;
 * filtrage tenant_id explicite (I9) ; zod sur le body PATCH.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseDealStore,
  getDealBySlug,
  updateDeal,
  type DealViewerCtx,
  type OperatorCtx,
  type UpdateDealInput,
} from "@/lib/invest/deal";
import { ComplianceBlockedError, InvariantViolationError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lit le statut KYC dénormalisé du viewer (gate des chiffres détaillés). */
async function viewerKycApproved(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("inv_investor_profiles")
    .select("kyc_status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { kyc_status?: string } | null)?.kyc_status === "approved";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const store = supabaseDealStore();

  try {
    const kycApproved = await viewerKycApproved(sb, tenantId, claims.sub);
    const ctx: DealViewerCtx = { userId: claims.sub, tenantId, kycApproved };

    // 1. Résolution par slug (route publique de la fiche).
    let detail = await getDealBySlug(store, ctx, id);

    // 2. Fallback : résolution par UUID si le slug n'a rien donné.
    if (!detail) {
      const byId = await store.findDealById(tenantId, id);
      if (byId) detail = await getDealBySlug(store, ctx, byId.slug);
    }

    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().max(120).nullish(),
  postalCode: z.string().trim().max(12).nullish(),
  acquisitionPriceEur: z.number().min(0).optional(),
  notaryFeesEur: z.number().min(0).optional(),
  worksBudgetEur: z.number().min(0).optional(),
  otherCostsEur: z.number().min(0).optional(),
  seniorDebtEur: z.number().min(0).optional(),
  sponsorEquityEur: z.number().min(0).optional(),
  appraisedValueEur: z.number().min(0).nullish(),
  targetRaiseEur: z.number().positive().optional(),
  minTicketEur: z.number().positive().optional(),
  maxTicketEur: z.number().positive().nullish(),
  durationMonths: z.number().int().positive().optional(),
  badges: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }

  const tenantId = tenantOf(claims);
  const ctx: OperatorCtx = { userId: claims.sub, tenantId, role: claims.role, scope: claims.scope };

  try {
    const deal = await updateDeal(supabaseDealStore(), ctx, id, parsed.data as UpdateDealInput);
    return NextResponse.json({ deal });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "forbidden", detail: e.reason }, { status: 403 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "update_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
