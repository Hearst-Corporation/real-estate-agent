/**
 * lib/invest/subscription/watchdog.ts — Refund/cancel watchdog (CORE, Epic 1.6).
 *
 * `runRefundWatchdog` est le CORE balayé périodiquement (Inngest `invRefundWatchdog`,
 * cron toutes les 15 min) OU appelable en synchrone. Il dénoue les souscriptions à
 * rembourser / annuler selon TROIS règles métier, IDEMPOTENT, AUDITÉ et FAIL-SOFT :
 *
 *   (a) DEAL `cancelled` → toute souscription ACTIVE du deal :
 *         • `funded`/`allocated`/`minted` → refund séquestre + statut `refunded` ;
 *         • `reserved`/`signed`           → `cancelled` (aucun fonds versé).
 *   (b) DEAL `open` dont la fenêtre (`closes_at`) est DÉPASSÉE SANS atteindre la
 *       levée (`raised_eur < target_raise_eur`) → MÊME dénouement que (a) sur ses
 *       souscriptions, + le deal passe `cancelled` (échec de levée, I4).
 *   (c) SOUSCRIPTION `funded` dont le délai de réflexion 4j est EXPIRÉ et dont le
 *       deal n'a JAMAIS été closé au-delà d'un délai de grâce (X jours après la
 *       fin de fenêtre) → refund (le closing n'a pas eu lieu : on rend les fonds).
 *
 * ── IDEMPOTENCE ──────────────────────────────────────────────────────────────
 * Clé par souscription (`refund:{subscriptionId}` / `cancel:{subscriptionId}`).
 * Les statuts terminaux (refunded/cancelled/withdrawn) sont IGNORÉS d'office ; un
 * second passage ne re-traite donc rien. La transition passe par la machine PURE
 * (`transition`) → jamais de statut forcé.
 *
 * ── FAIL-SOFT + DLQ ──────────────────────────────────────────────────────────
 * Refund via EscrowPort.refund. Escrow ABSENT ⇒ on marque la souscription
 * `refunded` quand même (l'ordre de remboursement réel se rejouera) et on enfile
 * une entrée `inv_failed_operations` (op_kind=`refund`, status=`open`) = DLQ. Un
 * ÉCHEC du tiers (exception) ⇒ idem : on n'altère PAS le statut, on enfile en DLQ
 * (rejeu manuel/automatique sûr car idempotent). Aucun blocage de la passe : une
 * souscription en échec n'interrompt pas les autres.
 *
 * Store INJECTABLE pour les tests (aucun réseau). Audit best-effort (recordAudit).
 */

import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { recordAudit, type AuditSupabase } from "../shared/audit";
import { getEscrowPort } from "../adapters";
import type { EscrowPort, EscrowProvider } from "../ports/escrow";
import { transition } from "./index";
import type { SubscriptionStatus } from "./types";

const DEFAULT_ESCROW_PROVIDER: EscrowProvider = "notaire";

/** Délai de grâce (jours) après fin de fenêtre avant refund (c) si jamais closé. */
export const CLOSING_GRACE_DAYS = 30;

/** Statuts ACTIFS (engageants) éligibles à un dénouement watchdog. */
const ACTIVE_STATUSES: readonly SubscriptionStatus[] = [
  "reserved",
  "signed",
  "funded",
  "allocated",
  "minted",
];

/** Statuts où des FONDS ont été versés en séquestre → refund (vs simple cancel). */
const FUNDED_STATUSES: readonly SubscriptionStatus[] = ["funded", "allocated", "minted"];

// ─── Rows DB (sous-ensembles, colonnes RÉELLES 0016/0017) ────────────────────

/** Deal candidat au balayage (sous-ensemble inv_deals — 0016). */
export interface WatchdogDealRow {
  id: string;
  tenant_id: string;
  status: string;
  target_raise_eur: number;
  raised_eur: number;
  closes_at: string | null;
  closed_at: string | null;
}

/** Souscription à dénouer (sous-ensemble inv_subscriptions — 0017). */
export interface WatchdogSubscriptionRow {
  id: string;
  tenant_id: string;
  deal_id: string;
  user_id: string;
  amount_eur: number;
  settlement_currency: string;
  status: string;
  cooling_off_ends_at: string | null;
}

// ─── Store injectable ─────────────────────────────────────────────────────────

/**
 * Store du watchdog. Toutes les méthodes sont filtrées `tenant_id` côté impl.
 * (le CORE ne lit que des lignes déjà tenant-scopées → pas de ré-assertion ici,
 * le filtrage SQL est la garde I9 ; cohérent avec les autres CORES de jobs).
 */
export interface RefundWatchdogStore {
  /** Deals `cancelled` (règle a). */
  listCancelledDeals(): Promise<WatchdogDealRow[]>;
  /** Deals `open` dont `closes_at` est dépassé `< nowIso` (règles b & c). */
  listExpiredOpenDeals(nowIso: string): Promise<WatchdogDealRow[]>;
  /** Souscriptions ACTIVES d'un deal (dénouement a/b). Tenant-scopé. */
  listActiveSubscriptions(tenantId: string, dealId: string): Promise<WatchdogSubscriptionRow[]>;
  /**
   * Souscriptions `funded` d'un deal dont le cooling-off est expiré `<= nowIso`
   * (règle c). Tenant-scopé.
   */
  listFundedCoolingOffExpired(
    tenantId: string,
    dealId: string,
    nowIso: string,
  ): Promise<WatchdogSubscriptionRow[]>;
  /** Σ EUROS des dépôts confirmés en séquestre d'une souscription (montant refund). */
  sumConfirmedDeposits(tenantId: string, subscriptionId: string): Promise<number>;
  /** Passe une souscription → `refunded` (+ refunded_at), GARDE statut actif. */
  markRefunded(tenantId: string, subscriptionId: string): Promise<void>;
  /** Passe une souscription → `cancelled`, GARDE statut reserved/signed. */
  markCancelled(tenantId: string, subscriptionId: string): Promise<void>;
  /** Insère un mouvement séquestre `refund` (miroir comptable, pending). */
  insertRefundMovement(
    tenantId: string,
    mv: {
      subscription_id: string;
      deal_id: string;
      user_id: string;
      amount_eur: number;
      currency: string;
      escrow_account_ref: string;
      bank_reference: string | null;
    },
  ): Promise<void>;
  /** Passe un deal → `cancelled` (échec de levée, règle b). GARDE statut open. */
  markDealCancelled(tenantId: string, dealId: string): Promise<void>;
  /** Enfile une entrée DLQ (`inv_failed_operations`) — échec définitif d'un refund. */
  pushFailedOperation(
    tenantId: string,
    op: {
      deal_id: string | null;
      subscription_id: string | null;
      op_kind: string;
      payload: Record<string, unknown>;
      last_error: string;
    },
  ): Promise<void>;
}

// ─── Résultat ─────────────────────────────────────────────────────────────────

/** Bilan d'une passe de watchdog. */
export interface RefundWatchdogResult {
  /** Deals examinés (cancelled + open expirés). */
  dealsScanned: number;
  /** Souscriptions remboursées (statut → refunded). */
  refunded: number;
  /** Souscriptions annulées (statut → cancelled, aucun fonds). */
  cancelled: number;
  /** Deals passés `cancelled` faute de levée (règle b). */
  dealsCancelled: number;
  /** Entrées DLQ créées (échecs de refund définitifs / escrow absent). */
  dlq: number;
}

// ─── Helpers PURS ─────────────────────────────────────────────────────────────

/** True si la fenêtre de souscription d'un deal `open` est dépassée. PUR. */
export function isFundingWindowExpired(deal: WatchdogDealRow, now = Date.now()): boolean {
  if (!deal.closes_at) return false;
  const t = new Date(deal.closes_at).getTime();
  if (Number.isNaN(t)) return false;
  return now > t;
}

/** True si la levée a ÉCHOUÉ (raised < target) — déclenche le refund (b). PUR. */
export function isRaiseFailed(deal: WatchdogDealRow): boolean {
  return Number(deal.raised_eur) < Number(deal.target_raise_eur);
}

/** True si le délai de grâce post-fenêtre est écoulé sans closing (c). PUR. */
export function isGracePeriodElapsed(
  deal: WatchdogDealRow,
  graceDays = CLOSING_GRACE_DAYS,
  now = Date.now(),
): boolean {
  if (deal.closed_at) return false; // déjà closé → pas de refund (c).
  if (!deal.closes_at) return false;
  const end = new Date(deal.closes_at).getTime();
  if (Number.isNaN(end)) return false;
  return now > end + graceDays * 86_400_000;
}

// ─── Dénouement d'UNE souscription (refund OU cancel), fail-soft + DLQ ─────────

/**
 * Rembourse OU annule une souscription selon son statut. Idempotent (terminaux
 * ignorés), machine PURE pour valider la transition, fail-soft (escrow absent ou
 * en échec ⇒ DLQ). Retourne le type d'effet appliqué (pour le bilan).
 */
async function settleOne(
  store: RefundWatchdogStore,
  escrow: EscrowPort,
  sb: AuditSupabase,
  sub: WatchdogSubscriptionRow,
  reason: string,
): Promise<"refunded" | "cancelled" | "skipped" | "dlq"> {
  const status = sub.status as SubscriptionStatus;
  if (!ACTIVE_STATUSES.includes(status)) return "skipped"; // terminal → idempotent no-op.

  // ── Cas SANS fonds (reserved/signed) → cancel ───────────────────────────────
  if (!FUNDED_STATUSES.includes(status)) {
    const r = transition(status, { type: "cancel" });
    if (!r.ok) return "skipped"; // la machine refuse (ex. déjà au-delà) → no-op.
    await store.markCancelled(sub.tenant_id, sub.id);
    await recordAudit(sb, {
      tenantId: sub.tenant_id,
      action: "subscription.cancelled",
      actorRole: "system",
      entityType: "inv_subscription",
      entityId: sub.id,
      after: { reason, from: status, dealId: sub.deal_id },
    });
    return "cancelled";
  }

  // ── Cas AVEC fonds (funded/allocated/minted) → refund séquestre ─────────────
  const r = transition(status === "funded" ? "funded" : status, { type: "refund" });
  if (!r.ok) return "skipped";

  const idemKey = `refund:${sub.id}`;
  const accountRef = `escrow:${sub.deal_id}`;
  const refundEur = await store.sumConfirmedDeposits(sub.tenant_id, sub.id);
  const amount = refundEur > 0 ? refundEur : Number(sub.amount_eur);

  let providerRef: string | null = null;
  let escrowOk = false;
  if (escrow.isConfigured()) {
    try {
      const res = await escrow.refund({
        account: { dealId: sub.deal_id, provider: DEFAULT_ESCROW_PROVIDER, externalRef: accountRef },
        subscriptionId: sub.id,
        amountEur: amount,
        idempotencyKey: idemKey,
      });
      providerRef = res.providerRef || null;
      escrowOk = true;
    } catch (e) {
      // Échec du tiers → DLQ (rejeu sûr car idempotent), on N'ALTÈRE PAS le statut.
      await store.pushFailedOperation(sub.tenant_id, {
        deal_id: sub.deal_id,
        subscription_id: sub.id,
        op_kind: "refund",
        payload: { idempotencyKey: idemKey, amountEur: amount, reason },
        last_error: e instanceof Error ? e.message : String(e),
      });
      await recordAudit(sb, {
        tenantId: sub.tenant_id,
        action: "refund.failed",
        actorRole: "system",
        entityType: "inv_subscription",
        entityId: sub.id,
        after: { reason, amountEur: amount, error: e instanceof Error ? e.message : String(e) },
      });
      return "dlq";
    }
  } else {
    // Escrow non configuré : on rend quand même le statut cohérent (DEEP/légal),
    // mais on enfile l'ordre de remboursement en DLQ pour exécution réelle ultérieure.
    await store.pushFailedOperation(sub.tenant_id, {
      deal_id: sub.deal_id,
      subscription_id: sub.id,
      op_kind: "refund",
      payload: { idempotencyKey: idemKey, amountEur: amount, reason, escrowConfigured: false },
      last_error: "escrow_not_configured",
    });
  }

  // Miroir comptable + statut refunded (fail-soft : escrow absent OU confirmé).
  await store.insertRefundMovement(sub.tenant_id, {
    subscription_id: sub.id,
    deal_id: sub.deal_id,
    user_id: sub.user_id,
    amount_eur: amount,
    currency: sub.settlement_currency,
    escrow_account_ref: accountRef,
    bank_reference: providerRef,
  });
  await store.markRefunded(sub.tenant_id, sub.id);
  await recordAudit(sb, {
    tenantId: sub.tenant_id,
    action: "subscription.refunded",
    actorRole: "system",
    entityType: "inv_subscription",
    entityId: sub.id,
    after: { reason, from: status, amountEur: amount, escrowConfigured: escrowOk },
  });
  return escrowOk ? "refunded" : "dlq"; // escrow absent compte aussi comme DLQ (ordre en attente).
}

// ─── CORE : runRefundWatchdog ──────────────────────────────────────────────────

/** Dépendances injectables (store + escrow). Défauts = Supabase / adaptateur. */
export interface RefundWatchdogDeps {
  store?: RefundWatchdogStore;
  escrow?: EscrowPort;
  /** Délai de grâce (jours) avant refund (c). Défaut CLOSING_GRACE_DAYS. */
  graceDays?: number;
  /** Horodatage de référence (tests). Défaut now. */
  now?: Date;
}

/**
 * Exécute une passe du watchdog refund/cancel (CORE partagé, idempotent, fail-soft).
 * Voir l'en-tête du module pour les règles (a/b/c). Ne throw qu'en cas d'erreur
 * d'INFRA inattendue lors du LISTAGE (l'appelant la capte / Inngest retente) ; le
 * traitement par souscription est entièrement fail-soft (DLQ, pas d'exception).
 *
 * @param sb client service-role (audit). Les stores par défaut l'ouvrent eux-mêmes.
 */
export async function runRefundWatchdog(
  sb: AuditSupabase,
  deps: RefundWatchdogDeps = {},
): Promise<RefundWatchdogResult> {
  const store = deps.store ?? supabaseRefundWatchdogStore();
  const escrow = deps.escrow ?? getEscrowPort();
  const graceDays = deps.graceDays ?? CLOSING_GRACE_DAYS;
  const now = deps.now ?? new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const res: RefundWatchdogResult = {
    dealsScanned: 0,
    refunded: 0,
    cancelled: 0,
    dealsCancelled: 0,
    dlq: 0,
  };

  const tally = (e: "refunded" | "cancelled" | "skipped" | "dlq") => {
    if (e === "refunded") res.refunded += 1;
    else if (e === "cancelled") res.cancelled += 1;
    else if (e === "dlq") res.dlq += 1;
  };

  // ── (a) Deals déjà `cancelled` → dénoue toutes les souscriptions actives ─────
  const cancelledDeals = await store.listCancelledDeals();
  for (const deal of cancelledDeals) {
    res.dealsScanned += 1;
    const subs = await store.listActiveSubscriptions(deal.tenant_id, deal.id);
    for (const sub of subs) {
      tally(await settleOne(store, escrow, sb, sub, "deal_cancelled"));
    }
  }

  // ── (b)/(c) Deals `open` dont la fenêtre est dépassée ───────────────────────
  const expiredOpen = await store.listExpiredOpenDeals(nowIso);
  for (const deal of expiredOpen) {
    if (!isFundingWindowExpired(deal, nowMs)) continue; // double-garde (SQL + pur).
    res.dealsScanned += 1;

    if (isRaiseFailed(deal)) {
      // (b) Échec de levée → on annule le deal + on dénoue ses souscriptions.
      const subs = await store.listActiveSubscriptions(deal.tenant_id, deal.id);
      for (const sub of subs) {
        tally(await settleOne(store, escrow, sb, sub, "funding_deadline_missed"));
      }
      await store.markDealCancelled(deal.tenant_id, deal.id);
      res.dealsCancelled += 1;
      await recordAudit(sb, {
        tenantId: deal.tenant_id,
        action: "deal.cancelled",
        actorRole: "system",
        entityType: "inv_deal",
        entityId: deal.id,
        after: {
          reason: "funding_deadline_missed",
          raisedEur: Number(deal.raised_eur),
          targetEur: Number(deal.target_raise_eur),
        },
      });
      continue;
    }

    // (c) Levée atteinte MAIS jamais closé après le délai de grâce → refund des
    //     funded dont le cooling-off est expiré (les fonds n'ont jamais été débloqués).
    if (isGracePeriodElapsed(deal, graceDays, nowMs)) {
      const subs = await store.listFundedCoolingOffExpired(deal.tenant_id, deal.id, nowIso);
      for (const sub of subs) {
        tally(await settleOne(store, escrow, sb, sub, "closing_grace_elapsed"));
      }
    }
  }

  return res;
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES) ──────────

/**
 * Store Supabase du watchdog, colonnes RÉELLES :
 *   - inv_deals (0016), inv_subscriptions (0017), inv_escrow_movements (0017),
 *   - inv_failed_operations (0021, DLQ).
 * Service-role → filtrage `tenant_id` partout (I9).
 */
export function supabaseRefundWatchdogStore(): RefundWatchdogStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[refund-watchdog] Supabase service-role non configuré");

  const DEAL_COLS = "id, tenant_id, status, target_raise_eur, raised_eur, closes_at, closed_at";
  const SUB_COLS =
    "id, tenant_id, deal_id, user_id, amount_eur, settlement_currency, status, cooling_off_ends_at";

  return {
    async listCancelledDeals() {
      const { data, error } = await db.from("inv_deals").select(DEAL_COLS).eq("status", "cancelled");
      if (error) throw error;
      return (data as unknown as WatchdogDealRow[]) ?? [];
    },

    async listExpiredOpenDeals(nowIso) {
      const { data, error } = await db
        .from("inv_deals")
        .select(DEAL_COLS)
        .eq("status", "open")
        .not("closes_at", "is", null)
        .lt("closes_at", nowIso);
      if (error) throw error;
      return (data as unknown as WatchdogDealRow[]) ?? [];
    },

    async listActiveSubscriptions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .in("status", ACTIVE_STATUSES as unknown as string[]);
      if (error) throw error;
      return (data as unknown as WatchdogSubscriptionRow[]) ?? [];
    },

    async listFundedCoolingOffExpired(tenantId, dealId, nowIso) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("status", "funded")
        .not("cooling_off_ends_at", "is", null)
        .lte("cooling_off_ends_at", nowIso);
      if (error) throw error;
      return (data as unknown as WatchdogSubscriptionRow[]) ?? [];
    },

    async sumConfirmedDeposits(tenantId, subscriptionId) {
      const { data, error } = await db
        .from("inv_escrow_movements")
        .select("amount_eur")
        .eq("tenant_id", tenantId)
        .eq("subscription_id", subscriptionId)
        .eq("movement_type", "deposit")
        .in("status", ["confirmed", "reconciled"]);
      if (error) throw error;
      const rows = (data as { amount_eur: number }[] | null) ?? [];
      return rows.reduce((acc, r) => acc + Number(r.amount_eur || 0), 0);
    },

    async markRefunded(tenantId, subscriptionId) {
      const { error } = await db
        .from("inv_subscriptions")
        .update({ status: "refunded", refunded_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", subscriptionId)
        .in("status", FUNDED_STATUSES as unknown as string[]); // garde concurrente.
      if (error) throw error;
    },

    async markCancelled(tenantId, subscriptionId) {
      const { error } = await db
        .from("inv_subscriptions")
        .update({ status: "cancelled" })
        .eq("tenant_id", tenantId)
        .eq("id", subscriptionId)
        .in("status", ["reserved", "signed"]); // garde concurrente.
      if (error) throw error;
    },

    async insertRefundMovement(tenantId, mv) {
      const { error } = await db.from("inv_escrow_movements").insert({
        tenant_id: tenantId,
        subscription_id: mv.subscription_id,
        deal_id: mv.deal_id,
        user_id: mv.user_id,
        direction: "outflow",
        movement_type: "refund",
        amount_eur: mv.amount_eur,
        currency: mv.currency,
        escrow_provider: DEFAULT_ESCROW_PROVIDER,
        escrow_account_ref: mv.escrow_account_ref,
        bank_reference: mv.bank_reference,
        status: "pending",
      });
      if (error) throw error;
    },

    async markDealCancelled(tenantId, dealId) {
      const { error } = await db
        .from("inv_deals")
        .update({ status: "cancelled" })
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .eq("status", "open"); // garde concurrente : ne touche qu'un deal encore open.
      if (error) throw error;
    },

    async pushFailedOperation(tenantId, op) {
      const { error } = await db.from("inv_failed_operations").insert({
        tenant_id: tenantId,
        deal_id: op.deal_id,
        subscription_id: op.subscription_id,
        op_kind: op.op_kind,
        payload: op.payload as never,
        attempts: 1,
        last_error: op.last_error,
        status: "open",
      });
      if (error) throw error;
    },
  };
}
