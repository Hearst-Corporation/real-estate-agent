/**
 * /api/invest/deals/{id}/reports — REPORTING de suivi d'un deal (Epic 1.5).
 *
 * GET — liste les rapports du deal (trimestriel / IFU). Lecture tenant ; un
 *   investisseur voit les rapports publiés de ses deals (RLS 0021 : published).
 *
 * POST — génère un rapport (best-effort, fail-soft R2). GARDE :
 *   - 401 sans session ; 503 sans Supabase ; 403 si non operator/admin/compliance.
 *   - délègue au CORE `generateDealReport` (écrit inv_reports + document R2 best-effort).
 *
 * Reporting FACTUEL et PAR DEAL : aucune valeur consolidée / NAV (anti-FIA L2).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { generateDealReport, type ReportingCtx } from "@/lib/invest/reporting";
import { InvariantViolationError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["reporting", "ifu"]).default("reporting"),
  periodStart: z.string().date().nullish(),
  periodEnd: z.string().date().nullish(),
  label: z.string().max(120).nullish(),
});

function isBackOffice(claims: { role?: string | null; scope: string[] }): boolean {
  return (
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator")
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  try {
    const { data, error } = await sb
      .from("inv_reports")
      .select("id, deal_id, report_type, period_start, period_end, title, status, published_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "list_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
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
  const ctx: ReportingCtx = { tenantId, actorUserId: claims.sub };
  const { kind, periodStart, periodEnd, label } = parsed.data;

  try {
    const result = await generateDealReport(sb, ctx, dealId, {
      kind,
      start: periodStart ?? null,
      end: periodEnd ?? null,
      label: label ?? null,
    });
    return NextResponse.json({ report: result }, { status: 201 });
  } catch (e) {
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "invalid_request", detail: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "report_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
