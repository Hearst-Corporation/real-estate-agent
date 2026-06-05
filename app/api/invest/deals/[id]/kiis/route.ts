/**
 * GET  /api/invest/deals/{id}/kiis — liste les versions KIIS/DIS d'un deal (back-office).
 * POST /api/invest/deals/{id}/kiis — crée une nouvelle version DRAFT du KIIS.
 *
 * KIIS versionné (WF-1, migration 0022) : machine d'états DRAFT→…→PUBLISHED.
 * La publication (qui fige le hash) est une route séparée
 * (POST /api/invest/deals/{id}/kiis/{versionId}/publish).
 *
 * Gardes : 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin/
 * compliance ; zod sur le body ; tenant_id explicite (I9).
 *
 * `{id}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseKiisStore,
  createKiisDraft,
  listKiisVersions,
} from "@/lib/invest/deal";
import type { OperatorCtx } from "@/lib/invest/deal";
import { ComplianceBlockedError, InvariantViolationError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operatorCtx(claims: { sub: string; tenant_id: string; role: string; scope: string[] }): OperatorCtx {
  return { userId: claims.sub, tenantId: tenantOf(claims), role: claims.role, scope: claims.scope };
}

function isBackOffice(claims: { role: string; scope: string[] }): boolean {
  return (
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator")
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  if (!isBackOffice(claims)) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  try {
    const versions = await listKiisVersions(supabaseKiisStore(), operatorCtx(claims), id);
    return NextResponse.json({ versions });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "forbidden", detail: e.reason }, { status: 403 });
    }
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

const CreateSchema = z.object({
  docType: z.enum(["KIIS", "DIS"]).optional(),
  // Contenu libre (sections A-G ECSP). Stocké en jsonb ; hashé à la publication.
  content: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  if (!isBackOffice(claims)) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const version = await createKiisDraft(supabaseKiisStore(), operatorCtx(claims), id, {
      docType: parsed.data.docType,
      content: parsed.data.content,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "forbidden", detail: e.reason }, { status: 403 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "kiis_create_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
