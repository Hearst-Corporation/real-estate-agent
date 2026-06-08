/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * Plomberie A5 (`ping`, `generatePdf`) + prospection + jobs invest (saga closing DvP) :
 *   - `ping`        — prouve que serve()/event fonctionne.
 *   - `generatePdf` — préchauffage PDF estimation.
 *   - `prospIngestion` — cron horaire ingestion annonces (MoteurImmo/Apify).
 *   - `prospScoring`   — cron 15 min matching acquéreurs + alertes.
 *   - `invClosingSaga`   — event `invest/deal.close.requested` → runClosingSaga (CORE).
 *   - `invReconcileTick` — cron 5 min → réconciliation DEEP↔chaîne des deals actifs.
 * Les jobs invest délèguent aux CORES partagés (lib/invest/{closing,tokenization}),
 * appelables aussi en synchrone si Inngest n'est pas configuré (fail-soft).
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";
import { captureFatal } from "@/lib/server/observe";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import { searchListingsApify, apifyProspectionIsConfigured } from "@/lib/prospection/apify-source";
import { upsertAnnonces } from "@/lib/prospection/ingest";
import { matchAnnonce } from "@/lib/prospection/matching/match";
import { sendMatchAlerte } from "@/lib/prospection/alert";
import type { CritereAcquereur, Annonce } from "@/lib/prospection/types";
import { MATCH_SCORE_MIN_PERSIST, MATCH_SCORE_ALERT } from "@/lib/prospection/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import { runClosingSaga } from "@/lib/invest/closing";
import { reconcile, supabaseTokenizationStore } from "@/lib/invest/tokenization";
import { runDistribution, type DistributionKind } from "@/lib/invest/distribution";
import { generateDealReport } from "@/lib/invest/reporting";
import { runRefundWatchdog } from "@/lib/invest/subscription";
import { recordAudit } from "@/lib/invest/shared/audit";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { drainFailedOperations, supabaseDlqDrainStore } from "@/lib/invest/shared/dlq-drain";
import { getEscrowPort } from "@/lib/invest/adapters";

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
      .eq("tenant_id", DEFAULT_TENANT_ID)
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
        return upsertAnnonces(DEFAULT_TENANT_ID, listings, provider);
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
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("actif", true);

    if (!criteres?.length) return { scored: 0, matched: 0 };

    let totalMatched = 0;
    for (const critereRow of criteres) {
      const zones: string[] = Array.isArray(critereRow.zones) ? (critereRow.zones as string[]) : [];
      const critere = dbRowToCritere(critereRow as Record<string, unknown>);

      const { data: annoncesRaw } = await db
        .from("prosp_annonces")
        .select("*")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .gte("date_collecte", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
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
              tenant_id:        DEFAULT_TENANT_ID,
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

          if (matchRow && !matchRow.alerted_at && result.score >= MATCH_SCORE_ALERT) {
            // CLAIM ATOMIQUE anti-double-alerte : on pose `alerted_at` AVANT l'envoi,
            // conditionné à `alerted_at IS NULL`. Sur rejeu Inngest (step.run relancé),
            // seul le 1er passage gagne la ligne → pas de spam WhatsApp. Filtrage
            // tenant systématique. Si l'envoi échoue ensuite, on compense (reset NULL).
            const { data: claimed } = await db
              .from("prosp_matchs")
              .update({ alerted_at: new Date().toISOString() })
              .eq("id", matchRow.id)
              .eq("tenant_id", DEFAULT_TENANT_ID)
              .is("alerted_at", null)
              .select("id")
              .maybeSingle();

            if (claimed) {
              try {
                const alertResult = await sendMatchAlerte(DEFAULT_TENANT_ID, critere, annonce, result.score);
                if (alertResult.sent) {
                  await db
                    .from("prosp_matchs")
                    .update({ statut: "alerte_envoyee" })
                    .eq("id", matchRow.id)
                    .eq("tenant_id", DEFAULT_TENANT_ID);
                } else {
                  // Pas d'envoi réel (cooldown/cap/no_channel) : on relâche le claim
                  // pour réessayer au prochain run dès que la condition se débloque.
                  await db
                    .from("prosp_matchs")
                    .update({ alerted_at: null })
                    .eq("id", matchRow.id)
                    .eq("tenant_id", DEFAULT_TENANT_ID);
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
                  .update({ alerted_at: null })
                  .eq("id", matchRow.id)
                  .eq("tenant_id", DEFAULT_TENANT_ID);
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

/**
 * SAGA DE CLOSING DvP (Epic 1.4) — event `invest/deal.close.requested`.
 *
 * Délègue au CORE `runClosingSaga` (ordre canonique : DEEP → mint → réconciliation
 * → release ; compensation refund sur échec avant release ; pause si chaîne>DEEP ;
 * fail-soft Tokeny/chaîne). La garde 4-eyes + conditions suspensives est revérifiée
 * DANS le core (jamais de closing sans garde). Idempotent : un rejeu ne re-traite
 * que les souscriptions au bon statut.
 */
export const invClosingSaga = inngest.createFunction(
  { id: "inv-closing-saga", retries: 4, triggers: [{ event: "invest/deal.close.requested" }] },
  async ({ event }) => {
    const data = event.data as { dealId?: string; tenantId?: string; actorUserId?: string | null };
    const dealId = data?.dealId;
    if (!dealId) return { skipped: "no_deal_id" };

    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const tenantId = data.tenantId ?? DEFAULT_TENANT_ID;
    try {
      const result = await runClosingSaga(sb, { tenantId, actorUserId: data.actorUserId ?? null }, dealId);
      // On NE throw PAS sur `compensated`/`paused`/`guard_failed` : ce sont des
      // issues métier VALIDES de la saga (fail-soft), pas des erreurs d'infra.
      return { ok: true, outcome: result.outcome, compensated: result.compensated };
    } catch (err) {
      captureFatal(err, "inngest/inv-closing-saga");
      throw err; // erreur d'infra inattendue → retry Inngest (commandes idempotentes)
    }
  },
);

/**
 * RÉCONCILIATION DEEP↔chaîne périodique (Epic 1.4) — cron toutes les 5 min.
 *
 * Pour chaque deal en cours de vie (closing/live/distributing), relance la passe
 * de réconciliation (DEEP gagne ; chaîne>DEEP ⇒ pause + escalade). Sans indexer
 * chaîne, chaque passe est `legal_only` (DEEP seul) — aucun blocage. Best-effort :
 * une passe en échec n'interrompt pas les autres deals.
 */
export const invReconcileTick = inngest.createFunction(
  { id: "inv-reconcile-tick", retries: 2, triggers: [{ cron: "*/5 * * * *" }] },
  async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const { data: deals, error } = await sb
      .from("inv_deals")
      .select("id, tenant_id")
      .in("status", ["closing", "live", "distributing"]);
    if (error) {
      captureFatal(error, "inngest/inv-reconcile-tick:list");
      return { skipped: "list_error" };
    }
    const rows = (deals as { id: string; tenant_id: string }[] | null) ?? [];

    let reconciled = 0;
    let paused = 0;
    for (const d of rows) {
      try {
        const r = await reconcile(supabaseTokenizationStore(), d.id, { tenantId: d.tenant_id });
        reconciled += 1;
        if (r.pause) paused += 1;
      } catch (err) {
        captureFatal(err, "inngest/inv-reconcile-tick:deal");
        // best-effort : on continue les autres deals.
      }
    }
    return { ok: true, deals: rows.length, reconciled, paused };
  },
);

/**
 * DISTRIBUTION (Epic 1.5) — events `invest/distribution.requested` ou
 * `invest/deal.exit`. Délègue au CORE `runDistribution` (waterfall depuis le
 * moteur financier → payouts au prorata des units ; règlement EUR via EscrowPort
 * en fail-soft → pending si non configuré ; idempotent par round). La garde
 * 4-eyes operator+compliance est faite en amont (route) ; l'event exit force
 * kind=`exit`. Idempotent : un rejeu rejoue la réponse du même round.
 */
export const invDistributionRun = inngest.createFunction(
  {
    id: "inv-distribution-run",
    retries: 4,
    triggers: [{ event: "invest/distribution.requested" }, { event: "invest/deal.exit" }],
  },
  async ({ event }) => {
    const data = event.data as {
      dealId?: string;
      tenantId?: string;
      actorUserId?: string | null;
      kind?: DistributionKind;
    };
    const dealId = data?.dealId;
    if (!dealId) return { skipped: "no_deal_id" };

    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const tenantId = data.tenantId ?? DEFAULT_TENANT_ID;
    // `invest/deal.exit` force un versement de sortie ; sinon kind du payload (défaut coupon).
    const kind: DistributionKind = event.name === "invest/deal.exit" ? "exit" : data.kind ?? "coupon";
    try {
      const result = await runDistribution(
        sb,
        { tenantId, actorUserId: data.actorUserId ?? null },
        dealId,
        kind,
      );
      return {
        ok: true,
        kind,
        distributionId: result.distributionId,
        holders: result.holders,
        payoutStatus: result.payoutStatus,
      };
    } catch (err) {
      captureFatal(err, "inngest/inv-distribution-run");
      throw err; // erreur d'infra inattendue → retry Inngest (commande idempotente)
    }
  },
);

/**
 * REPORTING TRIMESTRIEL (Epic 1.5) — cron trimestriel (1er du trimestre, 06:00).
 *
 * Pour chaque deal en vie (closing/live/distributing), génère un rapport de suivi
 * (best-effort, fail-soft R2). Une génération en échec n'interrompt pas les autres
 * deals. Reporting FACTUEL par deal (aucune NAV consolidée).
 */
export const invReportingQuarterly = inngest.createFunction(
  { id: "inv-reporting-quarterly", retries: 2, triggers: [{ cron: "0 6 1 1,4,7,10 *" }] },
  async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const { data: deals, error } = await sb
      .from("inv_deals")
      .select("id, tenant_id")
      .in("status", ["closing", "live", "distributing"]);
    if (error) {
      captureFatal(error, "inngest/inv-reporting-quarterly:list");
      return { skipped: "list_error" };
    }
    const rows = (deals as { id: string; tenant_id: string }[] | null) ?? [];

    let generated = 0;
    for (const d of rows) {
      try {
        await generateDealReport(sb, { tenantId: d.tenant_id }, d.id, { kind: "reporting" });
        generated += 1;
      } catch (err) {
        captureFatal(err, "inngest/inv-reporting-quarterly:deal");
        // best-effort : on continue les autres deals.
      }
    }
    return { ok: true, deals: rows.length, generated };
  },
);

/**
 * REFUND WATCHDOG (Epic 1.6) — cron toutes les 15 min.
 *
 * Délègue au CORE `runRefundWatchdog` (lib/invest/subscription) : dénoue les
 * souscriptions des deals (a) `cancelled`, (b) `open` à fenêtre dépassée sans
 * levée atteinte → cancel deal + refund, (c) `funded` cooling-off expiré jamais
 * closé après le délai de grâce → refund. Idempotent (clé par souscription),
 * audité, fail-soft : escrow absent/échec ⇒ statut cohérent + entrée DLQ
 * (`inv_failed_operations`). Une souscription en échec n'interrompt pas la passe.
 */
export const invRefundWatchdog = inngest.createFunction(
  { id: "inv-refund-watchdog", retries: 4, triggers: [{ cron: "*/15 * * * *" }] },
  async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };
    try {
      const r = await runRefundWatchdog(sb);
      return { ok: true, ...r };
    } catch (err) {
      captureFatal(err, "inngest/inv-refund-watchdog");
      throw err; // erreur d'infra au LISTAGE → retry Inngest (traitement idempotent).
    }
  },
);

/**
 * DLQ HANDLER (Epic 1.6) — event `invest/op.failed` (Pattern C).
 *
 * Range un échec définitif d'opération sortante (après retries épuisés) en
 * `inv_failed_operations` (status `open`, pour rejeu manuel/auto sûr car les
 * commandes sont idempotentes) + trace une alerte d'audit (best-effort). Le
 * webhook/job émetteur n'écrit JAMAIS la DLQ inline : il enfile cet event.
 */
export const invDlqHandler = inngest.createFunction(
  { id: "inv-dlq-handler", retries: 3, triggers: [{ event: "invest/op.failed" }] },
  async ({ event }) => {
    const data = event.data as {
      tenantId?: string;
      opKind?: string;
      idempotencyKey?: string;
      lastError?: string;
      dealId?: string | null;
      subscriptionId?: string | null;
      payload?: Record<string, unknown>;
    };
    const opKind = data?.opKind;
    if (!opKind) return { skipped: "no_op_kind" };

    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const tenantId = data.tenantId ?? DEFAULT_TENANT_ID;
    const { error } = await sb.from("inv_failed_operations").insert({
      tenant_id: tenantId,
      deal_id: data.dealId ?? null,
      subscription_id: data.subscriptionId ?? null,
      op_kind: opKind,
      payload: {
        idempotencyKey: data.idempotencyKey ?? null,
        ...(data.payload ?? {}),
      } as never,
      attempts: 1,
      last_error: data.lastError ?? "unknown",
      status: "open",
    });
    if (error) {
      captureFatal(error, "inngest/inv-dlq-handler:insert");
      throw error; // retry Inngest (insert DLQ ne doit pas se perdre).
    }

    // Alerte/trace d'audit best-effort (ne casse jamais le handler).
    await recordAudit(sb, {
      tenantId,
      action: "op.failed",
      actorRole: "system",
      entityType: data.dealId ? "inv_deal" : "inv_subscription",
      entityId: data.dealId ?? data.subscriptionId ?? null,
      after: { opKind, idempotencyKey: data.idempotencyKey ?? null, lastError: data.lastError ?? "unknown" },
    });
    return { ok: true, opKind };
  },
);

// DLQ DRAIN (CH2) — cron toutes les heures (cron "0 */1 * * *").
// Rejoue les entrées "open" de inv_failed_operations via drainFailedOperations
// (lib/invest/shared/dlq-drain). Seul op_kind="refund" est rejoué ; les autres
// sont laissés open (skipped). Fail-soft si escrow absent.
// Idempotent : l'escrow est idempotent par clé (refund:{subscriptionId}, I8).
export const invDlqDrain = inngest.createFunction(
  { id: "inv-dlq-drain", retries: 3, triggers: [{ cron: "0 */1 * * *" }] },
  async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };
    try {
      const result = await drainFailedOperations({
        store: supabaseDlqDrainStore(),
        escrow: getEscrowPort(),
        onError: captureFatal,
      });
      return { ok: true, ...result };
    } catch (err) {
      captureFatal(err, "inngest/inv-dlq-drain");
      throw err;
    }
  },
);

export const functions = [
  ping,
  generatePdf,
  prospIngestion,
  prospScoring,
  invClosingSaga,
  invReconcileTick,
  invDistributionRun,
  invReportingQuarterly,
  invRefundWatchdog,
  invDlqHandler,
  invDlqDrain,
];
