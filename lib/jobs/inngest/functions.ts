/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * Plomberie A5 (`ping`, `generatePdf`) + jobs Epic 1.4 (saga de closing DvP) :
 *   - `invClosingSaga`   — event `invest/deal.close.requested` → runClosingSaga (CORE).
 *   - `invReconcileTick` — cron 5 min → réconciliation DEEP↔chaîne des deals actifs.
 * Les deux délèguent aux CORES partagés (lib/invest/{closing,tokenization}), qui
 * sont aussi appelables en synchrone si Inngest n'est pas configuré (fail-soft).
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";
import { captureFatal } from "@/lib/server/observe";
import { runClosingSaga } from "@/lib/invest/closing";
import { reconcile, supabaseTokenizationStore } from "@/lib/invest/tokenization";
import { runDistribution, type DistributionKind } from "@/lib/invest/distribution";
import { generateDealReport } from "@/lib/invest/reporting";
import { runRefundWatchdog } from "@/lib/invest/subscription";
import { recordAudit } from "@/lib/invest/shared/audit";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";

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
  { id: "inv-closing-saga", triggers: [{ event: "invest/deal.close.requested" }] },
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
  { id: "inv-reconcile-tick", triggers: [{ cron: "*/5 * * * *" }] },
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
  { id: "inv-reporting-quarterly", triggers: [{ cron: "0 6 1 1,4,7,10 *" }] },
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
  { id: "inv-refund-watchdog", triggers: [{ cron: "*/15 * * * *" }] },
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
  { id: "inv-dlq-handler", triggers: [{ event: "invest/op.failed" }] },
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

export const functions = [
  ping,
  generatePdf,
  invClosingSaga,
  invReconcileTick,
  invDistributionRun,
  invReportingQuarterly,
  invRefundWatchdog,
  invDlqHandler,
];
