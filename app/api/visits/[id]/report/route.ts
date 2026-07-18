import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { visitReportSchema, type VisitReportRow } from "@/lib/visit-report/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compte-rendu de visite structuré (W7).
 * - Owner-check applicatif user+tenant sur la VISITE (service-role bypasse la RLS).
 * - Zod strict sur les enums (interest / outcome).
 * - Persistance dans `visit_reports` (1 CR par visite, upsert on visit_id).
 * - Dégradation honnête : table absante (migration 0051 non appliquée) → 503
 *   UNAVAILABLE, jamais un faux "enregistré".
 */

// Codes PostgREST/Postgres signalant une table/relation absente (migration
// 0051 pas encore appliquée sur gpu1) → capacité UNAVAILABLE, pas une erreur 500.
const MISSING_TABLE_CODES = new Set(["PGRST205", "PGRST202", "42P01"]);

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_TABLE_CODES.has(error.code);
}

/** Vérifie que la visite existe et appartient au user+tenant courant. */
async function assertOwnedVisit(
  sb: NonNullable<ReturnType<typeof getGpu1Admin>>,
  visitId: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("visits")
    .select("id")
    .eq("id", visitId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  if (!(await assertOwnedVisit(sb, id, claims.sub, tenantId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("visit_reports")
    .select("*")
    .eq("visit_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "unavailable", report: null }, { status: 503 });
    }
    console.error("[visit-report] read failed", { code: error.code });
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  return NextResponse.json({ report: (data as VisitReportRow | null) ?? null });
}

async function upsertReport(
  req: NextRequest,
  params: Promise<{ id: string }>,
) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  if (!raw) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const parsed = visitReportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tenantId = tenantOf(claims);
  // Owner-check : la visite doit appartenir au user+tenant (service-role bypass RLS).
  if (!(await assertOwnedVisit(sb, id, claims.sub, tenantId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const row = {
    visit_id: id,
    tenant_id: tenantId,
    user_id: claims.sub,
    interest: parsed.data.interest,
    outcome: parsed.data.outcome,
    positives: parsed.data.positives ?? null,
    objections: parsed.data.objections ?? null,
    next_action: parsed.data.next_action ?? null,
    price_discussed: parsed.data.price_discussed ?? null,
    reported_at: now,
    updated_at: now,
  };

  const { data, error } = await sb
    .from("visit_reports")
    .upsert(row, { onConflict: "visit_id" })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    console.error("[visit-report] upsert failed", { code: error?.code });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ report: data as VisitReportRow });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return upsertReport(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return upsertReport(req, params);
}
