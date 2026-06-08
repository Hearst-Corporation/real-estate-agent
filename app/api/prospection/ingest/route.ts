import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import {
  searchListingsApify,
  apifyProspectionIsConfigured,
} from "@/lib/prospection/apify-source";
import { upsertAnnonces } from "@/lib/prospection/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_ZONES = ["75011", "75012", "75013", "75014", "75015"];
const MAX_ZONES = 5;

/**
 * POST /api/prospection/ingest — déclenche une passe d'ingestion d'annonces À LA
 * DEMANDE (le cron `prosp-ingestion` fait la même chose toutes les heures).
 * Exécution INLINE pour un retour immédiat, indépendamment d'Inngest.
 * Écrit sous DEFAULT_TENANT_ID (même bucket que le cron → visible par le matching).
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

  const useMoteurImmo = moteurImmoIsConfigured();
  if (!useMoteurImmo && !apifyProspectionIsConfigured()) {
    return NextResponse.json({ error: "no_listings_provider" }, { status: 503 });
  }
  const provider = useMoteurImmo ? "moteurimmo" : "apify_lbc";

  // Zones : body > prosp_config > défaut.
  let zones: string[] = [];
  const body = (await req.json().catch(() => null)) as { zones?: unknown } | null;
  if (Array.isArray(body?.zones)) {
    zones = body.zones.filter((z): z is string => typeof z === "string");
  }
  if (zones.length === 0) {
    const { data: cfg } = await db
      .from("prosp_config")
      .select("zones_prioritaires")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .maybeSingle();
    zones = (cfg?.zones_prioritaires as string[] | null) ?? DEFAULT_ZONES;
  }
  zones = zones.slice(0, MAX_ZONES);

  let inserted = 0;
  let duplicates = 0;
  let errors = 0;
  for (const zone of zones) {
    try {
      const listings = useMoteurImmo
        ? await searchListings({ codePostal: zone, perPage: 50 })
        : await searchListingsApify(zone);
      const stats = await upsertAnnonces(DEFAULT_TENANT_ID, listings, provider);
      inserted += stats.inserted;
      duplicates += stats.duplicates;
      errors += stats.errors;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    provider,
    zones: zones.length,
    inserted,
    duplicates,
    errors,
  });
}
