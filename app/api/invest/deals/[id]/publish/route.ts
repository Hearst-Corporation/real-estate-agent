/**
 * POST /api/invest/deals/{id}/publish — publie un deal : draft → open.
 *
 * GARDE compliance/opérateur :
 *   - 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin.
 *   - 422 si la condition de publication n'est pas remplie :
 *       • aucun KIIS PUBLISHED pour ce deal (kiis_not_published) ;
 *       • statut courant non publiable (deal_not_publishable_from_status:*).
 *   - filtrage tenant_id explicite (I9).
 *
 * `{id}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { supabaseDealStore, publishDeal, type OperatorCtx } from "@/lib/invest/deal";
import { ComplianceBlockedError, InvariantViolationError } from "@/lib/invest/shared/errors";
import { recordAudit } from "@/lib/invest/shared/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

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
  const ctx: OperatorCtx = { userId: claims.sub, tenantId, role: claims.role, scope: claims.scope };

  try {
    const deal = await publishDeal(supabaseDealStore(), ctx, id);
    // Audit additif (best-effort, ne casse jamais la publication).
    await recordAudit(sb, {
      tenantId,
      action: "deal.published",
      actorUserId: claims.sub,
      actorRole: claims.role,
      entityType: "inv_deal",
      entityId: id,
      after: { status: "open" },
    });
    return NextResponse.json({ deal });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      // Condition de publication non remplie (KIIS manquant, statut, etc.) → 422.
      return NextResponse.json({ error: "publish_blocked", detail: e.reason }, { status: 422 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "publish_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
