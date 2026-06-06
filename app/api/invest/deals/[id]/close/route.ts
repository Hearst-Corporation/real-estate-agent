/**
 * POST /api/invest/deals/{id}/close — déclenche la SAGA DE CLOSING DvP (Epic 1.4).
 *
 * GARDE (toutes serveur) :
 *   - 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/compliance ;
 *   - 4-EYES : une approbation `deal_close` `approved` (operator+compliance distincts)
 *     DOIT exister dans inv_approvals → sinon 422 `four_eyes_required` ;
 *   - CONDITIONS SUSPENSIVES : toutes `is_met=true` → sinon 422 `conditions_unmet`.
 *
 * EXÉCUTION :
 *   - Inngest configuré → `inngest.send("invest/deal.close.requested")` (async) → 202 ;
 *   - sinon → `runClosingSaga` SYNCHRONE (fail-soft) → 200 avec le ClosingResult.
 *
 * DvP strict (release en dernier) + compensation refund + DEEP source de vérité :
 * toute la logique vit dans le CORE `runClosingSaga` ; cette route ne fait que la
 * garde d'accès + le routage async/sync. `{id}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { inngest, inngestIsConfigured } from "@/lib/jobs/inngest/client";
import {
  runClosingSaga,
  supabaseClosingStore,
  evaluateConditions,
  hasValidCloseApproval,
  type ClosingCtx,
} from "@/lib/invest/closing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Garde rôle : opérateur / admin / compliance uniquement.
  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const tenantId = tenantOf(claims);
  const ctx: ClosingCtx = { tenantId, actorUserId: claims.sub };

  try {
    // ── PRÉ-GARDE en amont (4-eyes + CS) : feedback 422 explicite AVANT la saga ──
    const store = supabaseClosingStore();
    const [conds, approvals] = await Promise.all([
      store.listConditions(tenantId, dealId),
      store.listCloseApprovals(tenantId, dealId),
    ]);
    const conditions = evaluateConditions(conds);
    if (!hasValidCloseApproval(approvals)) {
      return NextResponse.json(
        { error: "four_eyes_required", detail: "approbation deal_close (operator+compliance distincts) requise" },
        { status: 422 },
      );
    }
    if (!conditions.allMet) {
      return NextResponse.json(
        { error: "conditions_unmet", unmet: conditions.unmet, total: conditions.total },
        { status: 422 },
      );
    }

    // ── ROUTAGE async (Inngest) vs sync (fail-soft) ─────────────────────────────
    if (inngestIsConfigured()) {
      await inngest.send({
        name: "invest/deal.close.requested",
        data: { dealId, tenantId, actorUserId: claims.sub },
      });
      return NextResponse.json({ accepted: true, mode: "async", dealId }, { status: 202 });
    }

    const result = await runClosingSaga(sb, ctx, dealId);
    return NextResponse.json({ mode: "sync", result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "close_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
