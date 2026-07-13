import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { DEFAULT_TENANT } from "@/lib/tenant";
import { apifyProspectionIsConfigured } from "@/lib/prospection/apify-source";
import { normalizeScrapeParams, scrapeCustomAndMatch } from "@/lib/prospection/scrape-custom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/prospection/scrape-custom — prospection PERSONNALISÉE à la demande.
 * Body : { zone, typeBien?, budgetMin?, budgetMax?, surfaceMin?, surfaceMax?,
 *          piecesMin?, motsCles? }. Seul `zone` est requis.
 *
 * Scrape Apify → filtre serveur → dédup/upsert → matche les critères actifs.
 * Écrit sous DEFAULT_TENANT (même bucket que le cron → cohérent avec l'UI).
 * Mode dégradé : sans provider (Apify absent) → 503 no_listings_provider.
 */
export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  if (!apifyProspectionIsConfigured()) {
    return NextResponse.json({ error: "no_listings_provider" }, { status: 503 });
  }

  let params;
  try {
    const body = await req.json().catch(() => null);
    params = normalizeScrapeParams(body);
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_body";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  try {
    const result = await scrapeCustomAndMatch(db, DEFAULT_TENANT, params);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Log serveur détaillé ; réponse générique (pas de fuite d'erreur interne/scraper).
    console.error("prospection_scrape_custom_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "scrape_failed" }, { status: 502 });
  }
}
