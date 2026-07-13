/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * Plomberie A5 (`ping`, `generatePdf`) + prospection :
 *   - `ping`        — prouve que serve()/event fonctionne.
 *   - `generatePdf` — préchauffage PDF estimation.
 *   - `prospIngestion` — cron horaire ingestion annonces (MoteurImmo/Apify).
 *   - `prospScoring`   — cron 15 min matching acquéreurs + alertes.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";
import { captureFatal } from "@/lib/server/observe";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import { searchListingsApify, apifyProspectionIsConfigured } from "@/lib/prospection/apify-source";
import { upsertAnnonces } from "@/lib/prospection/ingest";
import { matchAnnonce } from "@/lib/prospection/matching/match";
import { dbRowToAnnonce, dbRowToCritere } from "@/lib/prospection/mappers";
import { sendMatchAlerte } from "@/lib/prospection/alert";
import { MATCH_SCORE_MIN_PERSIST, MATCH_SCORE_ALERT } from "@/lib/prospection/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DEFAULT_TENANT } from "@/lib/tenant";

type ProspAnnonceRow = Database["public"]["Tables"]["prosp_annonces"]["Row"];

/** No-op : prouve que la plomberie serve()/event fonctionne. */
export const ping = inngest.createFunction(
  { id: "ping", retries: 1, triggers: [{ event: "app/ping" }] },
  async ({ event }) => {
    return { ok: true, at: event.ts ?? null };
  },
);

/**
 * Pré-chauffage PDF (A5b) : rend + cache R2, pose pdf_status. Le GET synchrone
 * reste le fallback. Idempotence assurée par l'event id côté émetteur.
 */
export const generatePdf = inngest.createFunction(
  { id: "generate-pdf", retries: 2, triggers: [{ event: "estimation/pdf.prewarm" }] },
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
      .eq("tenant_id", DEFAULT_TENANT)
      .maybeSingle();

    const zones: string[] = (cfg?.zones_prioritaires as string[]) ?? ["75011","75012","75013","75014","75015"];
    const useMoteurImmo = moteurImmoIsConfigured();
    const provider = useMoteurImmo ? "moteurimmo" : "apify_lbc";
    if (!useMoteurImmo && !apifyProspectionIsConfigured()) {
      return { skipped: "no_listings_provider" };
    }

    let totalInserted = 0, totalDups = 0, totalErrors = 0;

    for (const zone of zones) {
      const listings = await step.run(`ingest:${zone}`, async () => {
        // MoteurImmo si configuré, sinon scraper Apify LeBonCoin (fallback réel).
        return useMoteurImmo
          ? searchListings({ codePostal: zone, perPage: 50 })
          : searchListingsApify(zone);
      });
      const stats = await step.run(`upsert:${zone}`, async () => {
        return upsertAnnonces(DEFAULT_TENANT, listings, provider);
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
      .eq("tenant_id", DEFAULT_TENANT)
      .eq("actif", true);

    if (!criteres?.length) return { scored: 0, matched: 0 };

    let totalMatched = 0;
    for (const critereRow of criteres) {
      const zones: string[] = Array.isArray(critereRow.zones) ? (critereRow.zones as string[]) : [];
      const critere = dbRowToCritere(critereRow as Record<string, unknown>);

      const { data: annoncesRaw } = await db
        .from("prosp_annonces")
        .select("*")
        .eq("tenant_id", DEFAULT_TENANT)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(500);
      const annonces = (annoncesRaw ?? []) as ProspAnnonceRow[];

      if (!annonces.length) continue;

      await step.run(`match:${critere.id}`, async () => {
        for (const row of annonces) {
          if (!zones.some(z => (String(row.code_postal ?? "")).startsWith(z))) continue;
          const annonce = dbRowToAnnonce(row);
          const result = matchAnnonce(critere, annonce);
          if (!result || result.score < MATCH_SCORE_MIN_PERSIST) continue;

          const { data: matchRow } = await db
            .from("prosp_matchs")
            .upsert({
              tenant_id:        DEFAULT_TENANT,
              user_id:          critere.userId,
              critere_id:       critere.id,
              annonce_id:       annonce.id,
              score_match:      result.score,
              score_breakdown:  result.breakdown as Json,
              features_snapshot: result.features as Json,
              engine_version:   result.engineVersion,
              // Index unique réel : uq_prosp_match(user_id, tenant_id, annonce_id, critere_id).
            }, { onConflict: "user_id,tenant_id,annonce_id,critere_id", ignoreDuplicates: false })
            .select("id,alerte_envoyee,alerte_at")
            .single();

          if (matchRow && !matchRow.alerte_at && result.score >= MATCH_SCORE_ALERT) {
            // CLAIM ATOMIQUE anti-double-alerte : on pose `alerted_at` AVANT l'envoi,
            // conditionné à `alerted_at IS NULL`. Sur rejeu Inngest (step.run relancé),
            // seul le 1er passage gagne la ligne → pas de spam WhatsApp. Filtrage
            // tenant systématique. Si l'envoi échoue ensuite, on compense (reset NULL).
            const { data: claimed } = await db
              .from("prosp_matchs")
              .update({ alerte_at: new Date().toISOString() })
              .eq("id", matchRow.id)
              .eq("tenant_id", DEFAULT_TENANT)
              .is("alerte_at", null)
              .select("id")
              .maybeSingle();

            if (claimed) {
              try {
                const alertResult = await sendMatchAlerte(DEFAULT_TENANT, critere, annonce, result.score);
                if (alertResult.sent) {
                  await db
                    .from("prosp_matchs")
                    .update({ alerte_envoyee: true })
                    .eq("id", matchRow.id)
                    .eq("tenant_id", DEFAULT_TENANT);
                } else {
                  // Pas d'envoi réel (cooldown/cap/no_channel) : on relâche le claim
                  // pour réessayer au prochain run dès que la condition se débloque.
                  await db
                    .from("prosp_matchs")
                    .update({ alerte_at: null, alerte_envoyee: false })
                    .eq("id", matchRow.id)
                    .eq("tenant_id", DEFAULT_TENANT);
                }
              } catch (err) {
                // L'envoi a jeté (Twilio/réseau) : on compense le claim et on logue.
                // L'exception ne casse JAMAIS le job → les autres critères continuent.
                console.error("[prospScoring] alert failed", {
                  critereId: critere.id,
                  annonceId: annonce.id,
                  matchId: matchRow.id,
                  error: err instanceof Error ? err.message : String(err),
                });
                await db
                  .from("prosp_matchs")
                  .update({ alerte_at: null, alerte_envoyee: false })
                  .eq("id", matchRow.id)
                  .eq("tenant_id", DEFAULT_TENANT);
                captureFatal(err, "inngest/prosp-scoring:alert");
              }
            }
          }
          totalMatched++;
        }
      });
    }

    return { scored: 0, matched: totalMatched };
  },
);

export const functions = [
  ping,
  generatePdf,
  prospIngestion,
  prospScoring,
];
