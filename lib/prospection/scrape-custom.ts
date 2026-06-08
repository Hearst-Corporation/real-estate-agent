/**
 * lib/prospection/scrape-custom.ts — Prospection PERSONNALISÉE à la demande (Lot 2).
 *
 * L'agent saisit des critères libres (ville, type, budget, surface, pièces,
 * mots-clés) → on scrape via Apify (réutilise `searchListingsApify`), on filtre
 * côté serveur (le scraper ne filtre que par ville/type), on déduplique +
 * persiste (`upsertAnnonces`, dédup `tenant_id,hash_dedup`), puis on matche les
 * annonces fraîches contre les critères acquéreurs ACTIFS (`matchAnnonce`).
 *
 * Aucun nouveau provider : Apify uniquement (clé `APIFY_TOKEN` déjà présente).
 * Mode dégradé : si aucun provider → l'appelant renvoie 503 (voir la route).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";
import { searchListingsApify } from "@/lib/prospection/apify-source";
import { upsertAnnonces } from "@/lib/prospection/ingest";
import { matchAnnonce } from "@/lib/prospection/matching/match";
import { dbRowToAnnonce, dbRowToCritere } from "@/lib/prospection/mappers";
import { MATCH_SCORE_MIN_PERSIST } from "@/lib/prospection/types";

export type ScrapeCustomParams = {
  /** Ville ou code postal (requis). */
  zone: string;
  typeBien: "appartement" | "maison";
  budgetMin: number | null;
  budgetMax: number | null;
  surfaceMin: number | null;
  surfaceMax: number | null;
  piecesMin: number | null;
  /** Mots-clés libres filtrés sur titre + description (ET logique). */
  motsCles: string[];
};

export type ScrapeCustomResult = {
  provider: "apify_lbc";
  /** Annonces remontées par le scraper avant filtrage serveur. */
  scraped: number;
  /** Annonces retenues après filtre budget/surface/pièces/mots-clés. */
  retained: number;
  inserted: number;
  duplicates: number;
  errors: number;
  /** Nb de matchs (≥ seuil de persistance) créés contre les critères actifs. */
  matched: number;
  /** Top matchs pour un retour immédiat à l'UI (id annonce + score + critère). */
  topMatchs: { annonceId: string; critereId: string; critereNom: string; score: number }[];
};

/**
 * Normalise/borne les params bruts d'un body de requête. Lève une `Error`
 * (`"zone_required"`) si la zone est vide — le seul champ obligatoire.
 */
export function normalizeScrapeParams(raw: unknown): ScrapeCustomParams {
  const body = (raw ?? {}) as Record<string, unknown>;
  const zone = typeof body.zone === "string" ? body.zone.trim() : "";
  if (!zone) throw new Error("zone_required");

  const typeBien = body.typeBien === "maison" ? "maison" : "appartement";
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const motsCles = Array.isArray(body.motsCles)
    ? body.motsCles.filter((m): m is string => typeof m === "string" && m.trim() !== "").map((m) => m.trim().toLowerCase())
    : typeof body.motsCles === "string"
      ? body.motsCles.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)
      : [];

  return {
    zone,
    typeBien,
    budgetMin: num(body.budgetMin),
    budgetMax: num(body.budgetMax),
    surfaceMin: num(body.surfaceMin),
    surfaceMax: num(body.surfaceMax),
    piecesMin: num(body.piecesMin),
    motsCles,
  };
}

/**
 * Applique les filtres serveur (le scraper ne filtre pas finement). Pure : testée
 * unitairement. Une borne `null` = pas de contrainte sur ce champ.
 */
export function filterListings(
  listings: MoteurImmoListing[],
  p: ScrapeCustomParams,
): MoteurImmoListing[] {
  return listings.filter((l) => {
    if (p.budgetMin != null && l.prix != null && l.prix < p.budgetMin) return false;
    if (p.budgetMax != null && l.prix != null && l.prix > p.budgetMax) return false;
    if (p.surfaceMin != null && l.surface != null && l.surface < p.surfaceMin) return false;
    if (p.surfaceMax != null && l.surface != null && l.surface > p.surfaceMax) return false;
    if (p.piecesMin != null && l.pieces != null && l.pieces < p.piecesMin) return false;
    if (p.motsCles.length > 0) {
      const hay = `${l.titre ?? ""} ${l.description ?? ""}`.toLowerCase();
      if (!p.motsCles.every((kw) => hay.includes(kw))) return false;
    }
    return true;
  });
}

/**
 * Cœur du scraping personnalisé : scrape → filtre → upsert → match.
 * `db` et `tenantId` injectés (route fournit le client service-role + le tenant).
 * Best-effort sur le scraping (jamais throw côté Apify) ; les erreurs DB par
 * annonce sont comptées dans `errors` sans casser le run.
 */
export async function scrapeCustomAndMatch(
  db: SupabaseClient<Database>,
  tenantId: string,
  params: ScrapeCustomParams,
): Promise<ScrapeCustomResult> {
  const raw = await searchListingsApify(params.zone, params.typeBien);
  const retained = filterListings(raw, params);

  const stats = await upsertAnnonces(tenantId, retained, "apify_lbc");

  // Matching : critères actifs × annonces fraîches de la zone demandée.
  const { data: criteresRaw } = await db
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("actif", true);

  const topMatchs: ScrapeCustomResult["topMatchs"] = [];
  let matched = 0;

  if (criteresRaw?.length && retained.length) {
    // On relit les annonces fraîchement upsertées de cette zone (avec leur id DB).
    const { data: annoncesRaw } = await db
      .from("prosp_annonces")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("date_collecte", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(500);

    const annonces = (annoncesRaw ?? []).map((r) => dbRowToAnnonce(r as Record<string, unknown>));

    for (const critereRow of criteresRaw) {
      const critere = dbRowToCritere(critereRow as Record<string, unknown>);
      for (const annonce of annonces) {
        const result = matchAnnonce(critere, annonce);
        if (!result || result.score < MATCH_SCORE_MIN_PERSIST) continue;

        const { error: matchErr } = await db.from("prosp_matchs").upsert(
          {
            tenant_id: tenantId,
            user_id: critere.userId,
            critere_id: critere.id,
            annonce_id: annonce.id,
            score_match: result.score,
            bonus_breakdown: result.breakdown,
            features_snapshot: result.features as Json,
            statut: "nouveau",
          },
          // L'index unique réel est uq_prosp_match(user_id, tenant_id, annonce_id, critere_id).
          { onConflict: "user_id,tenant_id,annonce_id,critere_id", ignoreDuplicates: false },
        );
        if (matchErr) continue;
        matched++;
        topMatchs.push({
          annonceId: annonce.id,
          critereId: critere.id,
          critereNom: critere.nom,
          score: result.score,
        });
      }
    }
  }

  topMatchs.sort((a, b) => b.score - a.score);

  return {
    provider: "apify_lbc",
    scraped: raw.length,
    retained: retained.length,
    inserted: stats.inserted,
    duplicates: stats.duplicates,
    errors: stats.errors,
    matched,
    topMatchs: topMatchs.slice(0, 10),
  };
}
