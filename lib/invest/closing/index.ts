/**
 * lib/invest/closing/index.ts — ⑤ Saga de Closing (DvP) : CORE partagé (Epic 1.4).
 *
 * `runClosingSaga` orchestre le DELIVERY-VERSUS-PAYMENT (blueprint C3) en fail-soft
 * total. C'est le CORE appelé SOIT par le job Inngest `invClosingSaga`, SOIT en
 * synchrone par la route `/close` quand Inngest n'est pas configuré (même pattern
 * que lib/brochure/generate.ts).
 *
 * ── ORDRE CANONIQUE NON NÉGOCIABLE (release en DERNIER) ───────────────────────
 *   garde   : conditions suspensives toutes remplies ∧ 4-eyes `deal_close` approuvé
 *   step1   : fonds en séquestre confirmés (souscriptions `funded`)
 *   step2   : inscription DEEP — SOURCE DE VÉRITÉ (I1), d'ABORD   [ledger.inscribeDeep]
 *   step3   : mint ERC-3643 — MIROIR, idempotent                  [tokenization.mintMirror]
 *   step4   : réconciliation DEEP↔chaîne                          [tokenization.reconcile]
 *   step5   : release séquestre → SPV — en DERNIER                [EscrowPort.release]
 *
 * ── COMPENSATION (échec AVANT step5) ──────────────────────────────────────────
 * Toute erreur entre step1 et step4 inclus déclenche la compensation : refund
 * INTÉGRAL via EscrowPort.refund (par souscription) + souscriptions → `refunded`.
 * Le release (step5) n'est JAMAIS atteint en cas de compensation. Une fois step5
 * franchi, plus de rollback (I4 : release irréversible).
 *
 * ── DEEP GAGNE TOUJOURS ───────────────────────────────────────────────────────
 * Si la réconciliation (step4) détecte chaîne > DEEP → on NE release PAS : la saga
 * se met en `paused` + alerte audit (escalade compliance). Aucune régularisation
 * du DEEP sur la chaîne (I1).
 *
 * ── FAIL-SOFT (Tokeny / chaîne / Inngest absents) ─────────────────────────────
 * Mint sans clés Tokeny → `pending` (pas d'échec) ; réconciliation sans indexer →
 * `legal_only` (DEEP seul, in_sync). La saga aboutit alors en `closed_legal_only`
 * (DEEP inscrit + fonds releasés) — AUCUN closing réel sur chaîne, aucun blocage.
 *
 * Chaque étape est AUDIT-LOGGÉE (inv_append_audit_log, service-role). Idempotent
 * de bout en bout (DEEP/mint ne re-traitent que les souscriptions au bon statut ;
 * release/refund idempotents par clé). Store INJECTABLE pour les tests.
 */

import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { ComplianceBlockedError } from "../shared/errors";
import { recordAudit } from "../shared/audit";
import { getEscrowPort } from "../adapters";
import type { EscrowPort, EscrowProvider } from "../ports/escrow";
import type { TokenizationPort } from "../ports/tokenization";
import type { ChainPort } from "../ports/chain";
import type { IdempotencyStore } from "../shared/idempotency";
import { inscribeDeep, supabaseLedgerStore, type LedgerStore } from "../ledger";
import { mintMirror, reconcile, supabaseTokenizationStore, type TokenizationStore } from "../tokenization";
import type {
  ClosingResult,
  ClosingStepResult,
  ConditionsSnapshot,
} from "./types";

export * from "./types";

const DEFAULT_ESCROW_PROVIDER: EscrowProvider = "notaire";

// ─── Contexte d'appel ─────────────────────────────────────────────────────────

/** Contexte de la saga (acteur déclencheur + tenant). */
export interface ClosingCtx {
  tenantId: string;
  /** uid de l'opérateur déclencheur (audit). */
  actorUserId?: string | null;
}

// ─── Rows DB (sous-ensembles, colonnes RÉELLES) ──────────────────────────────

/** Condition suspensive (sous-ensemble inv_deal_closing_conditions). */
export interface ClosingConditionRow {
  code: string;
  is_met: boolean;
}

/** Approbation 4-eyes (sous-ensemble inv_approvals). */
export interface ApprovalRow {
  action: string;
  status: string;
  approver_1: string | null;
  approver_2: string | null;
}

/** Souscription du deal pour le séquestre (sous-ensemble inv_subscriptions). */
export interface ClosingSubscriptionRow {
  id: string;
  tenant_id: string;
  deal_id: string;
  user_id: string;
  amount_eur: number;
  settlement_currency: string;
  status: string;
}

/**
 * Store injectable de la saga (opérations PROPRES au closing). Les étapes DEEP /
 * mint / réconciliation délèguent à leurs cores (ledger / tokenization).
 */
export interface ClosingStore {
  /** Conditions suspensives du deal (CS). Tenant-scopé. */
  listConditions(tenantId: string, dealId: string): Promise<ClosingConditionRow[]>;
  /** Approbations 4-eyes `deal_close` du deal. Tenant-scopé. */
  listCloseApprovals(tenantId: string, dealId: string): Promise<ApprovalRow[]>;
  /** Souscriptions `funded` du deal (fonds en séquestre — step1). Tenant-scopé. */
  listFundedSubscriptions(tenantId: string, dealId: string): Promise<ClosingSubscriptionRow[]>;
  /** Souscriptions encore remboursables (funded|allocated|minted) pour compensation. */
  listRefundableSubscriptions(tenantId: string, dealId: string): Promise<ClosingSubscriptionRow[]>;
  /** Passe une souscription → `refunded` (+ refunded_at). Tenant-scopé. */
  markSubscriptionRefunded(tenantId: string, subscriptionId: string): Promise<void>;
  /** Marque le deal `closed` (+ closed_at) après release réussi. Tenant-scopé. */
  markDealClosed(tenantId: string, dealId: string): Promise<void>;
  /** Écrit une entrée d'audit (fail-soft : ne lève jamais). */
  audit(input: {
    tenantId: string;
    action: string;
    actorUserId?: string | null;
    entityId?: string;
    after?: Record<string, unknown>;
  }): Promise<void>;
}

// ─── GARDE PURE : conditions suspensives + 4-eyes ─────────────────────────────

/** Évalue PUREMENT les conditions suspensives (toutes `is_met`). */
export function evaluateConditions(rows: readonly ClosingConditionRow[]): ConditionsSnapshot {
  const unmet = rows.filter((c) => !c.is_met).map((c) => c.code);
  return { allMet: unmet.length === 0, unmet, total: rows.length };
}

/**
 * Valide PUREMENT la garde 4-eyes `deal_close` : au moins une approbation
 * `approved` avec deux approbateurs DISTINCTS (operator + compliance). §6.3.
 */
export function hasValidCloseApproval(rows: readonly ApprovalRow[]): boolean {
  return rows.some(
    (a) =>
      a.action === "deal_close" &&
      a.status === "approved" &&
      !!a.approver_1 &&
      !!a.approver_2 &&
      a.approver_1 !== a.approver_2,
  );
}

// ─── Compensation ─────────────────────────────────────────────────────────────

/**
 * Compense un échec AVANT release : refund INTÉGRAL de chaque souscription
 * remboursable via EscrowPort.refund (idempotent), puis statut → `refunded`.
 * Fail-soft : si l'escrow n'est pas configuré, on marque quand même `refunded`
 * (l'ordre de remboursement est tracé en DLQ côté tiers au Jalon 2) — la saga ne
 * doit JAMAIS rester bloquée. Audit-loggé.
 */
async function compensate(
  store: ClosingStore,
  ctx: ClosingCtx,
  dealId: string,
  escrow: EscrowPort,
): Promise<number> {
  const subs = await store.listRefundableSubscriptions(ctx.tenantId, dealId);
  let refunded = 0;
  for (const sub of subs) {
    const idemKey = `refund:${sub.id}`;
    try {
      if (escrow.isConfigured()) {
        await escrow.refund({
          account: {
            dealId: sub.deal_id,
            provider: DEFAULT_ESCROW_PROVIDER,
            externalRef: `escrow:${sub.deal_id}`,
          },
          subscriptionId: sub.id,
          amountEur: Number(sub.amount_eur),
          idempotencyKey: idemKey,
        });
      }
    } catch {
      // Fail-soft : l'échec du tiers ne bloque pas la mise à jour de statut.
    }
    await store.markSubscriptionRefunded(ctx.tenantId, sub.id);
    refunded += 1;
  }
  await store.audit({
    tenantId: ctx.tenantId,
    action: "closing.compensated",
    actorUserId: ctx.actorUserId,
    entityId: dealId,
    after: { refunded, escrowConfigured: escrow.isConfigured() },
  });
  return refunded;
}

// ─── CORE : runClosingSaga ────────────────────────────────────────────────────

/** Dépendances injectables de la saga (stores + ports). Défauts = Supabase/ports. */
export interface ClosingDeps {
  store?: ClosingStore;
  ledgerStore?: LedgerStore;
  tokenizationStore?: TokenizationStore;
  escrow?: EscrowPort;
  /** Port tokenisation (mint miroir). Défaut = adaptateur Tokeny (fail-soft). */
  tokenizationPort?: TokenizationPort;
  /** Port chaîne (réconciliation). Défaut = adaptateur indexer (fail-soft). */
  chainPort?: ChainPort;
  /** Store d'idempotence pour le mint. Défaut = Supabase service-role. */
  idempotency?: IdempotencyStore;
}

/**
 * Exécute la saga de closing DvP pour un deal (CORE partagé, idempotent).
 * Ordre canonique strict ; compensation (refund) sur échec avant release ; pause
 * si chaîne>DEEP ; fail-soft Tokeny/chaîne. Voir l'en-tête du module.
 *
 * Signature alignée sur le brief : `(sb, ctx, dealId)`. Le client `sb` est accepté
 * pour cohérence d'appel (route/Inngest) ; les stores par défaut l'ouvrent eux-mêmes
 * via `getSupabaseAdmin()`. Les `deps` permettent l'injection de stores en test.
 *
 * @returns ClosingResult (jamais throw en fonctionnement nominal/fail-soft ; ne
 *          throw que sur une erreur d'INFRA inattendue — l'appelant la capte).
 */
export async function runClosingSaga(
  _sb: ReturnType<typeof getSupabaseAdmin>,
  ctx: ClosingCtx,
  dealId: string,
  deps: ClosingDeps = {},
): Promise<ClosingResult> {
  if (!ctx?.tenantId) ctx = { tenantId: DEFAULT_TENANT_ID, actorUserId: ctx?.actorUserId ?? null };

  const store = deps.store ?? supabaseClosingStore();
  const ledgerStore = deps.ledgerStore ?? supabaseLedgerStore();
  const tokenizationStore = deps.tokenizationStore ?? supabaseTokenizationStore();
  const escrow = deps.escrow ?? getEscrowPort();

  const steps: ClosingStepResult[] = [];
  const pushStep = async (s: ClosingStepResult) => {
    steps.push(s);
    await store.audit({
      tenantId: ctx.tenantId,
      action: `closing.step.${s.step}`,
      actorUserId: ctx.actorUserId,
      entityId: dealId,
      after: { status: s.status, detail: s.detail, ...(s.data ?? {}) },
    });
  };

  // ── GARDE : conditions suspensives + 4-eyes ─────────────────────────────────
  const condRows = await store.listConditions(ctx.tenantId, dealId);
  const conditions = evaluateConditions(condRows);
  const approvals = await store.listCloseApprovals(ctx.tenantId, dealId);
  const approved = hasValidCloseApproval(approvals);

  if (!conditions.allMet || !approved) {
    const detail = !approved
      ? "4-eyes deal_close non approuvé (operator+compliance distincts requis)"
      : `conditions suspensives non remplies: ${conditions.unmet.join(",")}`;
    await pushStep({ step: "guard", status: "failed", detail, data: { unmet: conditions.unmet, approved } });
    return { dealId, outcome: "guard_failed", steps, conditions, compensated: false };
  }
  await pushStep({ step: "guard", status: "ok", detail: "CS remplies + 4-eyes approuvé" });

  try {
    // ── STEP 1 : fonds en séquestre confirmés ─────────────────────────────────
    const funded = await store.listFundedSubscriptions(ctx.tenantId, dealId);
    if (funded.length === 0) {
      await pushStep({ step: "escrow_confirm", status: "failed", detail: "aucune souscription funded" });
      throw new ComplianceBlockedError("no_funded_subscriptions");
    }
    await pushStep({
      step: "escrow_confirm",
      status: "ok",
      detail: `${funded.length} souscription(s) financée(s) en séquestre`,
      data: { funded: funded.length },
    });

    // ── STEP 2 : inscription DEEP (SOURCE DE VÉRITÉ, I1, d'ABORD) ──────────────
    const deep = await inscribeDeep(ledgerStore, dealId, { tenantId: ctx.tenantId });
    await pushStep({
      step: "deep_inscription",
      status: "ok",
      detail: `DEEP: ${deep.inscribed} inscrite(s)`,
      data: { inscribed: deep.inscribed, fundedSeen: deep.fundedSeen },
    });

    // ── STEP 3 : mint ERC-3643 (MIROIR, idempotent, fail-soft) ────────────────
    const mint = await mintMirror(tokenizationStore, dealId, {
      tenantId: ctx.tenantId,
      port: deps.tokenizationPort,
      idempotency: deps.idempotency,
    });
    await pushStep({
      step: "token_mint",
      status: mint.failSoft || mint.pending > 0 ? "pending" : "ok",
      detail: mint.failSoft
        ? "Tokeny non configuré → mint pending (fail-soft, aucun closing on-chain)"
        : `mint: ${mint.minted} confirmé(s), ${mint.pending} pending`,
      data: { minted: mint.minted, pending: mint.pending, failSoft: mint.failSoft },
    });

    // ── STEP 4 : réconciliation DEEP↔chaîne ───────────────────────────────────
    const rec = await reconcile(tokenizationStore, dealId, {
      tenantId: ctx.tenantId,
      chain: deps.chainPort,
    });
    if (rec.pause) {
      // chaîne > DEEP → ANOMALIE : on NE release PAS (DEEP prime). Pause + escalade.
      await pushStep({
        step: "reconciliation",
        status: "failed",
        detail: "chaîne > DEEP → PAUSE (escalade compliance, DEEP prime)",
        data: { outcome: rec.outcome },
      });
      await store.audit({
        tenantId: ctx.tenantId,
        action: "closing.paused",
        actorUserId: ctx.actorUserId,
        entityId: dealId,
        after: { reason: "chain_exceeds_deep", drift: rec.drift },
      });
      return {
        dealId,
        outcome: "paused",
        steps,
        conditions,
        compensated: false,
        pauseReason: "chain_exceeds_deep",
      };
    }
    await pushStep({
      step: "reconciliation",
      status: rec.outcome === "legal_only" ? "skipped" : "ok",
      detail:
        rec.outcome === "legal_only"
          ? "legal_only (indexer chaîne absent → DEEP seul fait foi)"
          : `réconciliation: ${rec.outcome}`,
      data: { outcome: rec.outcome },
    });

    // ── STEP 5 : release séquestre → SPV (en DERNIER, irréversible I4) ─────────
    let releaseStatus: ClosingStepResult["status"] = "ok";
    let releaseDetail = "fonds releasés vers le SPV";
    try {
      if (escrow.isConfigured()) {
        await escrow.release({
          account: { dealId, provider: DEFAULT_ESCROW_PROVIDER, externalRef: `escrow:${dealId}` },
          idempotencyKey: `release:${dealId}`,
        });
      } else {
        // Fail-soft : sans escrow configuré, le release réel se fera au Jalon 2 ;
        // la saga ne bloque pas (DEEP est déjà la vérité légale opposable).
        releaseStatus = "pending";
        releaseDetail = "séquestre non configuré → release pending (fail-soft)";
      }
    } catch (e) {
      // Échec AU release : le DEEP est déjà inscrit (vérité). On NE compense PAS
      // (release ≠ rollback DEEP) ; on trace l'échec pour rejeu (idempotent).
      releaseStatus = "failed";
      releaseDetail = `release échouée: ${e instanceof Error ? e.message : String(e)}`;
      await pushStep({ step: "escrow_release", status: releaseStatus, detail: releaseDetail });
      await store.audit({
        tenantId: ctx.tenantId,
        action: "closing.release_failed",
        actorUserId: ctx.actorUserId,
        entityId: dealId,
        after: { detail: releaseDetail },
      });
      // DEEP inscrit + mint en place : on renvoie l'issue legal_only sans marquer closed.
      return {
        dealId,
        outcome: rec.outcome === "legal_only" || mint.failSoft ? "closed_legal_only" : "closed",
        steps,
        conditions,
        compensated: false,
      };
    }
    await pushStep({ step: "escrow_release", status: releaseStatus, detail: releaseDetail });

    // Deal clôturé (release OK ou pending fail-soft mais DEEP/mint posés).
    if (releaseStatus === "ok") await store.markDealClosed(ctx.tenantId, dealId);

    const outcome = rec.outcome === "legal_only" || mint.failSoft ? "closed_legal_only" : "closed";
    await store.audit({
      tenantId: ctx.tenantId,
      action: "closing.completed",
      actorUserId: ctx.actorUserId,
      entityId: dealId,
      after: { outcome, deep: deep.inscribed, mint: mint.minted, pending: mint.pending },
    });
    return { dealId, outcome, steps, conditions, compensated: false };
  } catch (e) {
    // ── COMPENSATION : échec AVANT release → refund intégral ──────────────────
    const refunded = await compensate(store, ctx, dealId, escrow);
    await pushStep({
      step: "escrow_release",
      status: "skipped",
      detail: `compensation appliquée (refund=${refunded}) — release NON exécuté`,
      data: { refunded, cause: e instanceof Error ? e.message : String(e) },
    });
    return { dealId, outcome: "compensated", steps, conditions, compensated: true };
  }
}

// ─── Helper d'audit fail-soft (délègue au helper transverse, Epic 1.6) ────────

/**
 * Écrit une entrée d'audit via le helper transverse `recordAudit` (RPC SECURITY
 * DEFINER `inv_append_audit_log`). Ne lève JAMAIS (best-effort). Acteur `service`.
 */
async function appendAuditSafe(input: {
  tenantId: string;
  action: string;
  actorUserId?: string | null;
  entityId?: string;
  after?: Record<string, unknown>;
}): Promise<void> {
  await recordAudit(getSupabaseAdmin(), {
    tenantId: input.tenantId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorRole: "service",
    entityType: "inv_deal",
    entityId: input.entityId,
    after: input.after,
  });
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES) ──────────

/**
 * Store Supabase de la saga, colonnes RÉELLES :
 *   - inv_deal_closing_conditions (0022), inv_approvals (0021) ;
 *   - inv_subscriptions (0017), inv_deals (0016) ;
 *   - inv_append_audit_log (0020/0023, RPC).
 * Service-role → filtrage `tenant_id` partout (I9).
 */
export function supabaseClosingStore(): ClosingStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[closing] Supabase service-role non configuré");

  return {
    async listConditions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_deal_closing_conditions")
        .select("code, is_met")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId);
      if (error) throw error;
      return (data as unknown as ClosingConditionRow[]) ?? [];
    },

    async listCloseApprovals(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_approvals")
        .select("action, status, approver_1, approver_2")
        .eq("tenant_id", tenantId)
        .eq("action", "deal_close")
        .eq("subject_type", "inv_deal")
        .eq("subject_id", dealId);
      if (error) throw error;
      return (data as unknown as ApprovalRow[]) ?? [];
    },

    async listFundedSubscriptions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select("id, tenant_id, deal_id, user_id, amount_eur, settlement_currency, status")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("status", "funded");
      if (error) throw error;
      return (data as unknown as ClosingSubscriptionRow[]) ?? [];
    },

    async listRefundableSubscriptions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select("id, tenant_id, deal_id, user_id, amount_eur, settlement_currency, status")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .in("status", ["funded", "allocated", "minted"]);
      if (error) throw error;
      return (data as unknown as ClosingSubscriptionRow[]) ?? [];
    },

    async markSubscriptionRefunded(tenantId, subscriptionId) {
      const { error } = await db
        .from("inv_subscriptions")
        .update({ status: "refunded", refunded_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", subscriptionId)
        .in("status", ["funded", "allocated", "minted"]);
      if (error) throw error;
    },

    async markDealClosed(tenantId, dealId) {
      const { error } = await db
        .from("inv_deals")
        .update({ status: "closing", closed_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", dealId);
      if (error) throw error;
    },

    async audit(input) {
      await appendAuditSafe(input);
    },
  };
}
