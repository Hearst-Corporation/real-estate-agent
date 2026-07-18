import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import type { VisitReportRow } from "@/lib/visit-report/schema";
import { dbRowToCritere } from "@/lib/prospection/mappers";
import {
  deriveSignals,
  deriveCriteriaSuggestions,
  deriveRelances,
  recomputeMatchesForProperty,
  persistSignals,
  createRelances,
} from "@/lib/post-visit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Boucle intelligente après visite (W3).
 *
 * GET  : dérive (SANS persister) signaux + suggestions de critères + relances
 *        proposées + recalcul de matchs → aperçu pour l'UI (l'humain décide).
 * POST : idem GET, PUIS PERSISTE les signaux (post_visit_signals) et MATÉRIALISE
 *        les relances (rea_tasks / brouillons outbox DRAFT). Les suggestions de
 *        critères ne sont JAMAIS appliquées ici — l'humain applique via la route
 *        existante PATCH /api/prospection/criteres.
 *
 * Dégradation honnête : visit_reports (0051) absente → 503 UNAVAILABLE.
 */

const MISSING_TABLE_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42703"]);
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_TABLE_CODES.has(error.code);
}

type Sb = NonNullable<ReturnType<typeof getGpu1Admin>>;

/** Charge la visite owner-checkée + son CR. */
async function loadVisitAndReport(
  sb: Sb,
  visitId: string,
  userId: string,
  tenantId: string,
): Promise<
  | { ok: true; visit: { id: string; lead_id: string | null; property_id: string | null }; report: VisitReportRow }
  | { ok: false; status: number; error: string }
> {
  const { data: visit } = await sb
    .from("visits")
    .select("id, lead_id, property_id")
    .eq("id", visitId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!visit) return { ok: false, status: 404, error: "not_found" };

  const { data: report, error: rErr } = await sb
    .from("visit_reports")
    .select("*")
    .eq("visit_id", visitId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (rErr) {
    if (isMissingTable(rErr)) return { ok: false, status: 503, error: "unavailable" };
    console.error("[post-visit] report read failed", { code: rErr.code });
    return { ok: false, status: 500, error: "read_failed" };
  }
  if (!report) return { ok: false, status: 404, error: "no_report" };

  return {
    ok: true,
    visit: visit as { id: string; lead_id: string | null; property_id: string | null },
    report: report as VisitReportRow,
  };
}

/** Charge le critère acquéreur lié au lead (le plus récent actif), s'il existe. */
async function loadCritereForLead(
  sb: Sb,
  leadId: string | null,
  userId: string,
  tenantId: string,
): Promise<{ budgetMin?: number; budgetMax?: number; critereId: string | null }> {
  if (!leadId) return { critereId: null };
  const { data, error } = await sb
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("lead_id", leadId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("actif", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { critereId: null };
  const c = dbRowToCritere(data as Record<string, unknown>);
  return { budgetMin: c.budgetMin, budgetMax: c.budgetMax, critereId: c.id };
}

async function buildPreview(sb: Sb, visitId: string, userId: string, tenantId: string) {
  const loaded = await loadVisitAndReport(sb, visitId, userId, tenantId);
  if (!loaded.ok) return loaded;

  const { visit, report } = loaded;
  const signals = deriveSignals(report);

  const critere = await loadCritereForLead(sb, visit.lead_id, userId, tenantId);
  const suggestions = deriveCriteriaSuggestions(report, {
    budgetMin: critere.budgetMin,
    budgetMax: critere.budgetMax,
  });

  const relances = deriveRelances(report);

  // Recalcul des matchs avec le moteur EXISTANT (si la visite porte un bien).
  let matches: Awaited<ReturnType<typeof recomputeMatchesForProperty>> | null = null;
  if (visit.property_id) {
    matches = await recomputeMatchesForProperty(sb, visit.property_id, userId, tenantId);
  }

  return {
    ok: true as const,
    visit,
    signals,
    critereId: critere.critereId,
    suggestions,
    relances,
    matches,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  const { visitId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const preview = await buildPreview(sb, visitId, claims.sub, tenantId);
  if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: preview.status });

  return NextResponse.json({
    signals: preview.signals,
    critereId: preview.critereId,
    // Suggestions PROPOSÉES — non appliquées. L'humain applique via /api/prospection/criteres.
    suggestions: preview.suggestions,
    relances: preview.relances,
    matches: preview.matches?.ok ? preview.matches.matches : [],
    matchesStatus: preview.matches ? (preview.matches.ok ? "live" : preview.matches.reason) : "no_property",
    persisted: false,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  const { visitId } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const preview = await buildPreview(sb, visitId, claims.sub, tenantId);
  if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: preview.status });

  // Persiste les signaux (obligatoire — c'est le cœur du POST). Table 0054 absente → 503.
  const signalsRes = await persistSignals(sb, {
    visitId,
    leadId: preview.visit.lead_id,
    userId: claims.sub,
    tenantId,
    signals: preview.signals,
  });
  if (!signalsRes.ok) {
    const status = signalsRes.reason === "unavailable" ? 503 : 500;
    return NextResponse.json({ error: signalsRes.reason }, { status });
  }

  // Matérialise les relances (tasks + drafts). Table absente = état honnête, pas 500.
  const relancesRes = await createRelances(sb, {
    visitId,
    leadId: preview.visit.lead_id,
    userId: claims.sub,
    tenantId,
    proposals: preview.relances,
  });

  return NextResponse.json({
    signals: preview.signals,
    signalId: signalsRes.data.signalId,
    critereId: preview.critereId,
    suggestions: preview.suggestions, // toujours PROPOSÉES, jamais appliquées
    relances: relancesRes.ok ? relancesRes.data : { tasks: "error", drafts: "error" },
    matches: preview.matches?.ok ? preview.matches.matches : [],
    matchesStatus: preview.matches ? (preview.matches.ok ? "live" : preview.matches.reason) : "no_property",
    persisted: true,
  });
}
