/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * Plomberie active hors DeFi :
 *   - `ping`        — prouve que serve()/event fonctionne.
 *   - `generatePdf` — préchauffage PDF estimation.
 *   - `prospIngestion` — cron horaire ingestion annonces (MoteurImmo/Apify).
 *   - `prospScoring`   — cron 15 min score mandat + matching acquéreurs + alertes.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";
import { captureFatal } from "@/lib/server/observe";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import { upsertAnnonces } from "@/lib/prospection/ingest";
import { matchAnnonce } from "@/lib/prospection/matching/match";
import { sendMatchAlerte } from "@/lib/prospection/alert";
import type { CritereAcquereur, Annonce } from "@/lib/prospection/types";
import type { Database, Json } from "@/lib/supabase/database.types";

type ProspAnnonceRow = Database["public"]["Tables"]["prosp_annonces"]["Row"];

/** No-op : prouve que la plomberie serve()/event fonctionne. */
export const ping = inngest.createFunction(
  { id: "ping", triggers: [{ event: "app/ping" }] },
  async ({ event }) => {
    return { ok: true, at: event.ts ?? null };
  },
);

/**
 * Pré-chauffage PDF (A5b) : rend + cache R2, pose pdf_status. Le GET synchrone
 * reste le fallback. Idempotence assurée par l'event id côté émetteur.
 */
export const generatePdf = inngest.createFunction(
  { id: "generate-pdf", triggers: [{ event: "estimation/pdf.prewarm" }] },
  async ({ event }) => {
    const estimationId = (event.data as { estimationId?: string })?.estimationId;
    if (!estimationId) return { skipped: "no_id" };

    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const { data: row } = await sb
      .from("estimations")
      .select("*")
      .eq("id", estimationId)
      .maybeSingle();
    if (!row) return { skipped: "not_found" };

    try {
      await renderAndCacheEstimationPdf(sb, row);
      await sb.from("estimations").update({ pdf_status: "ready" }).eq("id", estimationId);
      return { ok: true };
    } catch (err) {
      await sb.from("estimations").update({ pdf_status: "failed" }).eq("id", estimationId);
      captureFatal(err, "inngest/generate-pdf");
      throw err; // laisse Inngest enregistrer l'échec / retry
    }
  },
);

// ─── Prospection : ingestion horaire ──────────────────────────────────────────

export const prospIngestion = inngest.createFunction(
  { id: "prosp-ingestion", triggers: [{ cron: "0 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => {
    const db = getSupabaseAdmin();
    if (!db) return { skipped: "no_db" };

    const { data: cfg } = await db
      .from("prosp_config")
      .select("zones_prioritaires")
      .eq("tenant_id", "real-estate-agent")
      .maybeSingle();

    const zones: string[] = (cfg?.zones_prioritaires as string[]) ?? ["75011","75012","75013","75014","75015"];
    const provider = moteurImmoIsConfigured() ? "moteurimmo" : "apify_lbc";

    let totalInserted = 0, totalDups = 0, totalErrors = 0;

    for (const zone of zones) {
      const listings = await step.run(`ingest:${zone}`, async () => {
        return searchListings({ codePostal: zone, perPage: 50 });
      });
      const stats = await step.run(`upsert:${zone}`, async () => {
        return upsertAnnonces("real-estate-agent", listings, provider);
      });
      totalInserted += stats.inserted;
      totalDups += stats.duplicates;
      totalErrors += stats.errors;
    }

    return { zones: zones.length, inserted: totalInserted, duplicates: totalDups, errors: totalErrors };
  },
);

// ─── Prospection : scoring + matching + alertes (15 min) ─────────────────────
export const prospScoring = inngest.createFunction(
  { id: "prosp-scoring", triggers: [{ cron: "*/15 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => {
    const db = getSupabaseAdmin();
    if (!db) return { skipped: "no_db" };

    // Scoring mandat désactivé : prosp_annonces n'a pas de colonne score_mandat (le
    // scoring appartient à prosp_prospects, qui exige user_id). Le matching ci-dessous
    // reste opérationnel et alimente prosp_matchs.

    // Critères actifs
    const { data: criteres } = await db
      .from("prosp_criteres_acquereur")
      .select("*")
      .eq("tenant_id", "real-estate-agent")
      .eq("actif", true);

    if (!criteres?.length) return { scored: 0, matched: 0 };

    let totalMatched = 0;
    for (const critereRow of criteres) {
      const zones: string[] = Array.isArray(critereRow.zones) ? (critereRow.zones as string[]) : [];
      const critere = dbRowToCritere(critereRow as Record<string, unknown>);

      const { data: annoncesRaw } = await db
        .from("prosp_annonces")
        .select("*")
        .eq("tenant_id", "real-estate-agent")
        .gte("date_collecte", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(500);
      const annonces = (annoncesRaw ?? []) as ProspAnnonceRow[];

      if (!annonces.length) continue;

      await step.run(`match:${critere.id}`, async () => {
        for (const row of annonces) {
          if (!zones.some(z => (String(row.code_postal ?? "")).startsWith(z))) continue;
          const annonce = dbRowToAnnonce(row);
          const result = matchAnnonce(critere, annonce);
          if (!result || result.score < 50) continue;

          const { data: matchRow } = await db
            .from("prosp_matchs")
            .upsert({
              tenant_id:        "real-estate-agent",
              user_id:          critere.userId,
              critere_id:       critere.id,
              annonce_id:       annonce.id,
              score_match:      result.score,
              bonus_breakdown:  result.breakdown,
              features_snapshot: result.features as Json,
              statut:           "nouveau",
            }, { onConflict: "tenant_id,critere_id,annonce_id", ignoreDuplicates: false })
            .select("id,statut,alerted_at")
            .single();

          if (matchRow && !matchRow.alerted_at && result.score >= 70) {
            const alertResult = await sendMatchAlerte("real-estate-agent", critere, annonce, result.score);
            if (alertResult.sent) {
              await db.from("prosp_matchs").update({ alerted_at: new Date().toISOString(), statut: "alerte_envoyee" }).eq("id", matchRow.id);
            }
          }
          totalMatched++;
        }
      });
    }

    return { scored: 0, matched: totalMatched };
  },
);

function dbRowToAnnonce(row: Record<string, unknown>): Annonce {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    source: String(row.source_platform ?? row.source ?? ""),
    sourceId: String(row.source_id),
    hashDedup: String(row.hash_dedup),
    typeBien: String(row.type_bien),
    titre: (row.title ?? row.titre) as string | undefined,
    description: row.description as string | undefined,
    prix: row.prix as number | undefined,
    surface: (row.surface_m2 ?? row.surface) as number | undefined,
    pieces: (row.nb_pieces ?? row.pieces) as number | undefined,
    codePostal: row.code_postal as string | undefined,
    ville: (row.commune ?? row.ville) as string | undefined,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    ascenseur: row.ascenseur as boolean | undefined,
    terrasse: row.terrasse as boolean | undefined,
    parking: row.parking as boolean | undefined,
    jardin: row.jardin as boolean | undefined,
    piscine: row.piscine as boolean | undefined,
    dpe: (row.dpe_note ?? row.dpe) as string | undefined,
    url: (row.source_url ?? row.url) as string | undefined,
    photos: (row.photos_urls ?? row.photos) as string[] | undefined,
    isPap: String(row.type_annonceur ?? "").toLowerCase() === "pap",
    datePublication: (row.premiere_parution_at ?? row.date_publication) as string | undefined,
    prixPrecedent: (row.prix_original ?? row.prix_precedent) as number | undefined,
    republication: row.derniere_republication_at != null,
  };
}

function dbRowToCritere(row: Record<string, unknown>): CritereAcquereur {
  const pref = (v: unknown) => (["requis","exclu"].includes(String(v)) ? String(v) as "requis"|"exclu" : "indifferent");
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    leadId: row.lead_id as string | undefined,
    nom: String(row.nom),
    typeBien: row.type_bien as string[] | undefined,
    budgetMin: row.budget_min as number | undefined,
    budgetMax: row.budget_max as number | undefined,
    surfaceMin: row.surface_min as number | undefined,
    surfaceMax: row.surface_max as number | undefined,
    piecesMin: row.pieces_min as number | undefined,
    piecesMax: row.pieces_max as number | undefined,
    zones: Array.isArray(row.zones) ? row.zones.map(String) : [],
    terrasse: pref(row.terrasse),
    parking: pref(row.parking),
    ascenseur: pref(row.ascenseur),
    jardin: pref(row.jardin),
    piscine: pref(row.piscine),
    dpeMax: row.dpe_max as string | undefined,
    alerteEmail: Boolean(row.alerte_email),
    alerteWhatsapp: Boolean(row.alerte_whatsapp),
    telephone: row.telephone as string | undefined,
    actif: Boolean(row.actif),
  };
}

export const functions = [ping, generatePdf, prospIngestion, prospScoring];
