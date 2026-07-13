import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import {
  searchListingsApify,
  apifyProspectionIsConfigured,
} from "@/lib/prospection/apify-source";
import {
  upsertAnnonces,
  startIngestionRun,
  finishIngestionRun,
  bodyHash,
  lookupIdempotent,
  reserveIdempotent,
  completeIdempotent,
} from "@/lib/prospection/ingest";
import type { IngestStats } from "@/lib/prospection/types";
import type { Json } from "@/lib/supabase/database.types";

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
 *
 * Chaque passe :
 *   - crée une ligne `prosp_ingestion_runs` (status=running) au démarrage,
 *     mise à jour à la fin (completed/failed + compteurs + error_detail) ;
 *   - accepte une `Idempotency-Key` (header ou body) → une passe déjà exécutée
 *     avec la même clé renvoie sa réponse mémorisée sans relancer d'ingestion ;
 *   - dégrade proprement : un provider en échec n'impute que `errors`, jamais un
 *     crash du run entier.
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

  const body = (await req.json().catch(() => null)) as
    | { zones?: unknown; idempotency_key?: unknown }
    | null;

  // Idempotence : header prioritaire, sinon body.
  const idemKey =
    req.headers.get("Idempotency-Key") ||
    (typeof body?.idempotency_key === "string" ? body.idempotency_key : null);

  if (idemKey) {
    const cached = await lookupIdempotent(DEFAULT_TENANT_ID, idemKey);
    if (cached !== null) {
      return NextResponse.json(cached, { headers: { "Idempotent-Replay": "true" } });
    }
    // Pose le verrou. false ⇒ clé déjà réservée (course / rejeu concurrent).
    const reserved = await reserveIdempotent(
      DEFAULT_TENANT_ID,
      idemKey,
      bodyHash({ zones: body?.zones ?? null, provider }),
    );
    if (!reserved) {
      return NextResponse.json(
        { error: "ingestion_in_progress" },
        { status: 409, headers: { "Idempotent-Replay": "pending" } },
      );
    }
  }

  // Zones : body > prosp_config > défaut.
  let zones: string[] = [];
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

  const run = await startIngestionRun(DEFAULT_TENANT_ID, provider, zones);
  const totals: IngestStats = { inserted: 0, updated: 0, duplicates: 0, errors: 0 };
  const errorDetails: string[] = [];

  for (const zone of zones) {
    try {
      const listings = useMoteurImmo
        ? await searchListings({ codePostal: zone, perPage: 50 })
        : await searchListingsApify(zone);
      const stats = await upsertAnnonces(DEFAULT_TENANT_ID, listings, provider);
      totals.inserted += stats.inserted;
      totals.updated += stats.updated;
      totals.duplicates += stats.duplicates;
      totals.errors += stats.errors;
    } catch (e) {
      totals.errors += 1;
      errorDetails.push(`${zone}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const status = totals.errors > 0 && totals.inserted + totals.updated === 0 ? "failed" : "completed";
  if (run) {
    await finishIngestionRun(
      run,
      status === "failed" ? "failed" : "completed",
      totals,
      errorDetails.length > 0 ? errorDetails.join(" | ") : null,
    );
  }

  const responseBody = {
    ok: status !== "failed",
    provider,
    zones: zones.length,
    run_id: run?.id ?? null,
    inserted: totals.inserted,
    updated: totals.updated,
    duplicates: totals.duplicates,
    errors: totals.errors,
  };

  if (idemKey) {
    await completeIdempotent(DEFAULT_TENANT_ID, idemKey, responseBody as unknown as Json);
  }

  return NextResponse.json(responseBody);
}
