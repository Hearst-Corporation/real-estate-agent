/**
 * lib/invest/subscription/watchdog.test.ts — Refund/cancel watchdog (Epic 1.6).
 *
 * Stores + escrow MÉMOIRE (aucun réseau, aucune DB, audit no-op via sb=null). On
 * vérifie les TROIS règles (a deal cancelled, b funding deadline manquée, c grace
 * écoulée), l'IDEMPOTENCE (2e passe = 0 effet), et le FAIL-SOFT + DLQ (escrow
 * absent ⇒ statut refunded + entrée DLQ ; escrow en échec ⇒ pas de statut + DLQ).
 */

import { describe, it, expect } from "vitest";
import {
  runRefundWatchdog,
  isFundingWindowExpired,
  isRaiseFailed,
  isGracePeriodElapsed,
  type RefundWatchdogStore,
  type WatchdogDealRow,
  type WatchdogSubscriptionRow,
} from "./watchdog";
import type { EscrowPort } from "../ports/escrow";

const TENANT = "real-estate-agent";
const NOW = new Date("2026-06-05T12:00:00.000Z");

// ─── Escrow mémoire ────────────────────────────────────────────────────────────

/** Escrow configuré qui réussit le refund (et journalise les appels). */
function escrowOk(calls: string[]): EscrowPort {
  return {
    isConfigured: () => true,
    async createDepositInstruction() {
      return { providerRef: "dep", instructions: {} };
    },
    async release() {
      return { providerRef: "rel" };
    },
    async refund(input) {
      calls.push(input.subscriptionId);
      return { providerRef: `refund:${input.subscriptionId}` };
    },
    verifyWebhook: () => true,
  };
}

/** Escrow NON configuré (fail-soft → DLQ + statut refunded). */
const ESCROW_ABSENT: EscrowPort = {
  isConfigured: () => false,
  async createDepositInstruction() {
    return { providerRef: "", instructions: {} };
  },
  async release() {
    return { providerRef: "" };
  },
  async refund() {
    return { providerRef: "" };
  },
  verifyWebhook: () => false,
};

/** Escrow configuré qui ÉCHOUE (exception → DLQ, statut NON modifié). */
const ESCROW_FAILS: EscrowPort = {
  ...ESCROW_ABSENT,
  isConfigured: () => true,
  async refund() {
    throw new Error("provider_500");
  },
};

// ─── Store mémoire ──────────────────────────────────────────────────────────────

interface MemState {
  cancelledDeals: WatchdogDealRow[];
  expiredOpenDeals: WatchdogDealRow[];
  subsByDeal: Record<string, WatchdogSubscriptionRow[]>;
  deposits: Record<string, number>;
  // effets observables
  refunded: string[];
  cancelled: string[];
  refundMovements: string[];
  dealsCancelled: string[];
  dlq: { op_kind: string; subscription_id: string | null; last_error: string }[];
}

function memStore(state: MemState): RefundWatchdogStore {
  // Applique les gardes de statut comme le ferait le SQL (idempotence concurrente).
  const setStatus = (subId: string, allowed: string[], next: string) => {
    for (const subs of Object.values(state.subsByDeal)) {
      const s = subs.find((x) => x.id === subId);
      if (s && allowed.includes(s.status)) s.status = next;
    }
  };
  return {
    async listCancelledDeals() {
      return state.cancelledDeals;
    },
    async listExpiredOpenDeals() {
      return state.expiredOpenDeals;
    },
    async listActiveSubscriptions(_t, dealId) {
      return (state.subsByDeal[dealId] ?? []).filter((s) =>
        ["reserved", "signed", "funded", "allocated", "minted"].includes(s.status),
      );
    },
    async listFundedCoolingOffExpired(_t, dealId, nowIso) {
      return (state.subsByDeal[dealId] ?? []).filter(
        (s) =>
          s.status === "funded" &&
          s.cooling_off_ends_at != null &&
          s.cooling_off_ends_at <= nowIso,
      );
    },
    async sumConfirmedDeposits(_t, subId) {
      return state.deposits[subId] ?? 0;
    },
    async markRefunded(_t, subId) {
      setStatus(subId, ["funded", "allocated", "minted"], "refunded");
      state.refunded.push(subId);
    },
    async markCancelled(_t, subId) {
      setStatus(subId, ["reserved", "signed"], "cancelled");
      state.cancelled.push(subId);
    },
    async insertRefundMovement(_t, mv) {
      state.refundMovements.push(mv.subscription_id);
    },
    async markDealCancelled(_t, dealId) {
      state.dealsCancelled.push(dealId);
    },
    async pushFailedOperation(_t, op) {
      state.dlq.push({ op_kind: op.op_kind, subscription_id: op.subscription_id, last_error: op.last_error });
    },
  };
}

function freshState(overrides: Partial<MemState> = {}): MemState {
  return {
    cancelledDeals: [],
    expiredOpenDeals: [],
    subsByDeal: {},
    deposits: {},
    refunded: [],
    cancelled: [],
    refundMovements: [],
    dealsCancelled: [],
    dlq: [],
    ...overrides,
  };
}

function deal(p: Partial<WatchdogDealRow> & { id: string; status: string }): WatchdogDealRow {
  return {
    tenant_id: TENANT,
    target_raise_eur: 100_000,
    raised_eur: 100_000,
    closes_at: null,
    closed_at: null,
    ...p,
  };
}

function sub(p: Partial<WatchdogSubscriptionRow> & { id: string; deal_id: string; status: string }): WatchdogSubscriptionRow {
  return {
    tenant_id: TENANT,
    user_id: `u-${p.id}`,
    amount_eur: 10_000,
    settlement_currency: "EUR",
    cooling_off_ends_at: null,
    ...p,
  };
}

// ─── Helpers purs ───────────────────────────────────────────────────────────────

describe("helpers purs", () => {
  it("isFundingWindowExpired : true si closes_at < now", () => {
    expect(isFundingWindowExpired(deal({ id: "d", status: "open", closes_at: "2026-06-01T00:00:00Z" }), NOW.getTime())).toBe(true);
    expect(isFundingWindowExpired(deal({ id: "d", status: "open", closes_at: "2026-12-01T00:00:00Z" }), NOW.getTime())).toBe(false);
    expect(isFundingWindowExpired(deal({ id: "d", status: "open", closes_at: null }), NOW.getTime())).toBe(false);
  });

  it("isRaiseFailed : true si raised < target", () => {
    expect(isRaiseFailed(deal({ id: "d", status: "open", raised_eur: 40_000, target_raise_eur: 100_000 }))).toBe(true);
    expect(isRaiseFailed(deal({ id: "d", status: "open", raised_eur: 100_000, target_raise_eur: 100_000 }))).toBe(false);
  });

  it("isGracePeriodElapsed : true si fenêtre + grace dépassés et jamais closé", () => {
    const old = deal({ id: "d", status: "open", closes_at: "2026-04-01T00:00:00Z" });
    expect(isGracePeriodElapsed(old, 30, NOW.getTime())).toBe(true); // >30j après le 1er avril
    const recent = deal({ id: "d", status: "open", closes_at: "2026-06-01T00:00:00Z" });
    expect(isGracePeriodElapsed(recent, 30, NOW.getTime())).toBe(false);
    const closed = deal({ id: "d", status: "open", closes_at: "2026-01-01T00:00:00Z", closed_at: "2026-02-01T00:00:00Z" });
    expect(isGracePeriodElapsed(closed, 30, NOW.getTime())).toBe(false); // déjà closé → pas de refund (c)
  });
});

// ─── Cas (a) : deal cancelled ────────────────────────────────────────────────────

describe("cas (a) — deal cancelled", () => {
  it("refund les souscriptions financées + cancel les reserved/signed", async () => {
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: {
        d1: [
          sub({ id: "s-funded", deal_id: "d1", status: "funded" }),
          sub({ id: "s-allocated", deal_id: "d1", status: "allocated" }),
          sub({ id: "s-reserved", deal_id: "d1", status: "reserved" }),
          sub({ id: "s-signed", deal_id: "d1", status: "signed" }),
          sub({ id: "s-refunded", deal_id: "d1", status: "refunded" }), // terminal → ignoré (mais pas listé actif)
        ],
      },
    });
    const calls: string[] = [];
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: escrowOk(calls), now: NOW });

    expect(r.refunded).toBe(2); // funded + allocated
    expect(r.cancelled).toBe(2); // reserved + signed
    expect(calls.sort()).toEqual(["s-allocated", "s-funded"]); // refund escrow appelé pour les financées
    expect(state.refunded.sort()).toEqual(["s-allocated", "s-funded"]);
    expect(state.cancelled.sort()).toEqual(["s-reserved", "s-signed"]);
    expect(r.dlq).toBe(0);
  });

  it("utilise le montant des dépôts confirmés s'il existe", async () => {
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: { d1: [sub({ id: "s1", deal_id: "d1", status: "funded", amount_eur: 10_000 })] },
      deposits: { s1: 9_500 }, // montant réellement déposé < nominal
    });
    let refundedAmount = -1;
    const escrow: EscrowPort = {
      ...escrowOk([]),
      async refund(input) {
        refundedAmount = input.amountEur;
        return { providerRef: "ok" };
      },
    };
    await runRefundWatchdog(null, { store: memStore(state), escrow, now: NOW });
    expect(refundedAmount).toBe(9_500);
  });
});

// ─── Cas (b) : funding deadline manquée ──────────────────────────────────────────

describe("cas (b) — funding deadline manquée sans levée", () => {
  it("annule le deal + dénoue ses souscriptions", async () => {
    const state = freshState({
      expiredOpenDeals: [
        deal({ id: "d2", status: "open", closes_at: "2026-06-01T00:00:00Z", raised_eur: 40_000, target_raise_eur: 100_000 }),
      ],
      subsByDeal: {
        d2: [
          sub({ id: "s-funded", deal_id: "d2", status: "funded" }),
          sub({ id: "s-reserved", deal_id: "d2", status: "reserved" }),
        ],
      },
    });
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: escrowOk([]), now: NOW });
    expect(r.dealsCancelled).toBe(1);
    expect(state.dealsCancelled).toEqual(["d2"]);
    expect(r.refunded).toBe(1);
    expect(r.cancelled).toBe(1);
  });

  it("ne touche PAS un deal open dont la levée est atteinte (pas (b))", async () => {
    const state = freshState({
      expiredOpenDeals: [
        deal({ id: "d2", status: "open", closes_at: "2026-06-01T00:00:00Z", raised_eur: 100_000, target_raise_eur: 100_000 }),
      ],
      subsByDeal: { d2: [sub({ id: "s1", deal_id: "d2", status: "funded" })] },
    });
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: escrowOk([]), now: NOW });
    expect(r.dealsCancelled).toBe(0);
    expect(r.refunded).toBe(0); // pas (b) ; et pas (c) car grace non écoulée (closes le 1er juin, now le 5)
  });
});

// ─── Cas (c) : grace écoulée, jamais closé ───────────────────────────────────────

describe("cas (c) — levée atteinte mais jamais closé après le délai de grâce", () => {
  it("refund les funded dont le cooling-off est expiré", async () => {
    const state = freshState({
      expiredOpenDeals: [
        // levée atteinte (raised == target) mais closes_at très ancien (>30j) et jamais closé.
        deal({ id: "d3", status: "open", closes_at: "2026-04-01T00:00:00Z", raised_eur: 100_000, target_raise_eur: 100_000 }),
      ],
      subsByDeal: {
        d3: [
          sub({ id: "s-cool-expired", deal_id: "d3", status: "funded", cooling_off_ends_at: "2026-04-06T00:00:00Z" }),
        ],
      },
    });
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: escrowOk([]), now: NOW });
    expect(r.refunded).toBe(1);
    expect(state.refunded).toEqual(["s-cool-expired"]);
    expect(r.dealsCancelled).toBe(0); // (c) ne CANCEL PAS le deal (levée atteinte)
  });
});

// ─── Idempotence ─────────────────────────────────────────────────────────────────

describe("idempotence", () => {
  it("une 2e passe ne re-traite plus rien (statuts devenus terminaux)", async () => {
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: {
        d1: [
          sub({ id: "s-funded", deal_id: "d1", status: "funded" }),
          sub({ id: "s-reserved", deal_id: "d1", status: "reserved" }),
        ],
      },
    });
    const calls: string[] = [];
    const store = memStore(state);
    const r1 = await runRefundWatchdog(null, { store, escrow: escrowOk(calls), now: NOW });
    expect(r1.refunded + r1.cancelled).toBe(2);

    // 2e passe : les souscriptions sont désormais refunded/cancelled → la liste
    // `listActiveSubscriptions` les exclut → aucun nouvel effet.
    const r2 = await runRefundWatchdog(null, { store, escrow: escrowOk(calls), now: NOW });
    expect(r2.refunded).toBe(0);
    expect(r2.cancelled).toBe(0);
    expect(calls.length).toBe(1); // refund escrow appelé UNE seule fois au total
  });
});

// ─── Fail-soft + DLQ ─────────────────────────────────────────────────────────────

describe("fail-soft + DLQ", () => {
  it("escrow ABSENT → statut refunded quand même + entrée DLQ (ordre en attente)", async () => {
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: { d1: [sub({ id: "s1", deal_id: "d1", status: "funded" })] },
    });
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: ESCROW_ABSENT, now: NOW });
    expect(state.refunded).toEqual(["s1"]); // statut cohérent (DEEP/légal)
    expect(state.dlq).toHaveLength(1);
    expect(state.dlq[0]).toMatchObject({ op_kind: "refund", subscription_id: "s1", last_error: "escrow_not_configured" });
    expect(r.dlq).toBe(1);
  });

  it("escrow EN ÉCHEC → statut NON modifié + entrée DLQ (rejeu idempotent)", async () => {
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: { d1: [sub({ id: "s1", deal_id: "d1", status: "funded" })] },
    });
    const r = await runRefundWatchdog(null, { store: memStore(state), escrow: ESCROW_FAILS, now: NOW });
    expect(state.refunded).toEqual([]); // PAS de markRefunded sur échec dur
    expect(state.refundMovements).toEqual([]); // pas de mouvement comptable non plus
    expect(state.dlq).toHaveLength(1);
    expect(state.dlq[0]).toMatchObject({ op_kind: "refund", subscription_id: "s1" });
    expect(state.dlq[0].last_error).toContain("provider_500");
    expect(r.dlq).toBe(1);
    expect(r.refunded).toBe(0);
  });

  it("un échec sur une souscription n'interrompt pas le traitement des autres", async () => {
    // s1 échoue (escrow fail), s2 aussi (même escrow) → les DEUX vont en DLQ, la
    // passe ne s'arrête pas après s1.
    const state = freshState({
      cancelledDeals: [deal({ id: "d1", status: "cancelled" })],
      subsByDeal: {
        d1: [
          sub({ id: "s1", deal_id: "d1", status: "funded" }),
          sub({ id: "s2", deal_id: "d1", status: "allocated" }),
        ],
      },
    });
    await runRefundWatchdog(null, { store: memStore(state), escrow: ESCROW_FAILS, now: NOW });
    expect(state.dlq.map((d) => d.subscription_id).sort()).toEqual(["s1", "s2"]);
  });
});
