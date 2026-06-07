/**
 * POST /api/invest/deals/{id}/kiis/{versionId}/publish — publie une version KIIS.
 *
 * Machine d'états (WF-1) : DRAFT/APPROVED → PUBLISHED. À la publication :
 *   - le HASH sha256 du contenu est FIGÉ (pdf_sha256) → opposabilité ;
 *   - les versions PUBLISHED antérieures passent en SUPERSEDED ;
 *   - inv_kiis_documents.current_version est mis à jour.
 *
 * Une fois une version PUBLISHED, le deal devient publiable
 * (POST /api/invest/deals/{id}/publish).
 *
 * Gardes : 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/
 * compliance ; 422 si l'état n'autorise pas la publication ; tenant_id explicite.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { supabaseKiisStore, publishKiisVersion, type OperatorCtx } from "@/lib/invest/deal";
import { ComplianceBlockedError, InvariantViolationError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { versionId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const isBackOffice =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isBackOffice) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const ctx: OperatorCtx = {
    userId: claims.sub,
    tenantId: tenantOf(claims),
    role: claims.role,
    scope: claims.scope,
  };

  try {
    const version = await publishKiisVersion(supabaseKiisStore(), ctx, versionId);
    return NextResponse.json({ version });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "publish_blocked", detail: e.reason }, { status: 422 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "kiis_publish_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
