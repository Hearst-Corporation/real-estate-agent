/**
 * /api/invest/deals/{id}/distributions — DISTRIBUTIONS d'un deal (Epic 1.5).
 *
 * POST — lance une distribution (coupon|exit). GARDE :
 *   - 401 sans session ; 503 sans Supabase ; 403 si non operator/admin/compliance ;
 *   - 4-EYES operator+compliance : une approbation `deal_close` `approved`
 *     (approbateurs DISTINCTS) doit exister dans inv_approvals → sinon 422
 *     `four_eyes_required` (le même gate operator+compliance qui a autorisé le
 *     closing autorise les versements ; aucune action `distribution` n'existe au
 *     schéma — on réutilise la garde 4-eyes du deal).
 *   - EXÉCUTION : Inngest configuré → event `invest/distribution.requested` (202) ;
 *     sinon → `runDistribution` SYNCHRONE (fail-soft) → 200 avec le résultat.
 *
 * GET — liste l'historique des distributions du deal (niveau tranche). Lecture
 *   réservée au tenant (membres) ; un investisseur voit l'historique de ses deals.
 *
 * Le calcul du waterfall→payouts vit dans le CORE `runDistribution` (moteur
 * financier pur) ; cette route ne fait que la garde + le routage async/sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { inngest, inngestIsConfigured } from "@/lib/jobs/inngest/client";
import { supabaseClosingStore, hasValidCloseApproval } from "@/lib/invest/closing";
import {
  runDistribution,
  listDistributionsForDeal,
  type DistributionCtx,
} from "@/lib/invest/distribution";
import { InvariantViolationError, IdempotencyConflictError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["coupon", "exit"]),
});

/** True si le caller a le rôle back-office (operator/admin/compliance). */
function isBackOffice(claims: { role?: string | null; scope: string[] }): boolean {
  return (
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator")
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  if (!isBackOffice(claims)) {
    return NextResponse.json(
      { error: "forbidden", detail: "operator_or_compliance_required" },
      { status: 403 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }

  const tenantId = tenantOf(claims);
  const { kind } = parsed.data;
  const ctx: DistributionCtx = { tenantId, actorUserId: claims.sub };

  try {
    // GARDE 4-eyes operator+compliance (réutilise l'approbation deal_close du deal).
    const approvals = await supabaseClosingStore().listCloseApprovals(tenantId, dealId);
    if (!hasValidCloseApproval(approvals)) {
      return NextResponse.json(
        { error: "four_eyes_required", detail: "approbation operator+compliance (distincts) requise" },
        { status: 422 },
      );
    }

    // ROUTAGE async (Inngest) vs sync (fail-soft).
    if (inngestIsConfigured()) {
      await inngest.send({
        name: "invest/distribution.requested",
        data: { dealId, tenantId, actorUserId: claims.sub, kind },
      });
      return NextResponse.json({ accepted: true, mode: "async", dealId, kind }, { status: 202 });
    }

    const result = await runDistribution(sb, ctx, dealId, kind);
    return NextResponse.json({ mode: "sync", result }, { status: 200 });
  } catch (e) {
    if (e instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "invalid_request", detail: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "distribution_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  try {
    const items = await listDistributionsForDeal({ tenantId, actorUserId: claims.sub }, dealId);
    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "list_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
