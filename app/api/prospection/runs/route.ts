import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/prospection/runs — historique des runs d'ingestion du tenant.
 * Observabilité : provider, statut, compteurs, durée. Filtré par tenant
 * (les runs sont tenant-wide, pas per-user). Aucune donnée sensible exposée.
 */
export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 20;
  const tenantId = tenantOf(claims);

  const { data, error } = await db
    .from("prosp_ingestion_runs")
    .select("id,provider,zones,status,inserted,updated,duplicates,errors,started_at,ended_at,error_detail")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    // Table absente / colonne manquante → liste vide plutôt qu'une 500 bloquante.
    if (code === "42P01" || code === "42703") {
      return NextResponse.json({ data: [] });
    }
    console.error("prospection_runs_fetch_failed", { tenantId, code });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
