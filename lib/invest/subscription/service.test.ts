/**
 * lib/invest/subscription/service.test.ts — services souscription DB-backed (Epic 1.3).
 *
 * Testés via un `SubscriptionStore` EN MÉMOIRE + ports e-sign/escrow simulés
 * (aucun réseau, aucune DB). Couvre :
 *   - createSoftCommit : gardes deal open / KYC / suitability / ticket / plafond ;
 *   - plafond ECSP 12 mois glissants (somme active + ticket ; fenêtre glissante) ;
 *   - transitions pilotées par WEBHOOK (reserved→signed, signed→funded) + rejets ;
 *   - cancel : annulation avant versement, rétractation pendant 4j, refus hors délai ;
 *   - fail-soft : sign/fund lèvent ProviderUnavailableError si port non configuré.
 *
 * Aucune transition n'est pilotée par le client : tout passe par la machine pure.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSoftCommit,
  requestSignature,
  instructFunding,
  cancel,
  listMySubscriptions,
  applyEsignWebhook,
  applyEscrowWebhook,
  checkAnnualCap,
  twelveMonthsAgoIso,
  isSuitable,
  COOLING_OFF_DAYS,
  type SubscriptionStore,
  type SubscriptionCtx,
  type SubscriptionRow,
  type DealForSubscription,
  type ProfileForSubscription,
  type SubscriptionPatch,
} from "./service";
import type { ESignaturePort, ESignDomainEvent } from "../ports/esignature";
import type { EscrowPort } from "../ports/escrow";
import { ComplianceBlockedError, InvariantViolationError, ProviderUnavailableError } from "../shared/errors";

const TENANT = "real-estate-agent";

// ─── Ports simulés ─────────────────────────────────────────────────────────────

function fakeEsign(configured = true): ESignaturePort {
  return {
    isConfigured: () => configured,
    async requestSignature(input) {
      return { envelopeId: `env_${input.subscriptionId}`, signUrl: "https://sign.example/x" };
    },
    verifyWebhook: () => true,
    parseEvent: () => ({ envelopeId: "", state: "SIGNED", docSha256: null, providerEventId: "e" }),
  };
}

function fakeEscrow(configured = true): EscrowPort & { refunds: number } {
  return {
    refunds: 0,
    isConfigured: () => configured,
    async createDepositInstruction() {
      return { providerRef: "dep_1", instructions: { iban: "FR76****" } };
    },
    async release() {
      return { providerRef: "rel_1" };
    },
    async refund() {
      this.refunds += 1;
      return { providerRef: "ref_1" };
    },
    verifyWebhook: () => true,
  };
}

// ─── Store en mémoire ──────────────────────────────────────────────────────────

interface MemDeal extends DealForSubscription {}
interface MemProfile extends ProfileForSubscription {}

function memStore(opts?: {
  deal?: Partial<MemDeal>;
  profile?: Partial<MemProfile>;
  /** Souscriptions préexistantes (pour tester le plafond / la fenêtre 12 mois). */
  seed?: Partial<SubscriptionRow>[];
}) {
  const deal: MemDeal = {
    id: "deal_1",
    tenant_id: TENANT,
    status: "open",
    min_ticket_eur: 1000,
    max_ticket_eur: 50000,
    settlement_currency: "EUR",
    bond_tranche_id: "tr_1",
    nominal_unit_eur: 1000,
    ...opts?.deal,
  };
  const profile: MemProfile = {
    id: "prof_1",
    tenant_id: TENANT,
    user_id: "user_1",
    investor_class: "non_sophisticated",
    kyc_status: "approved",
    appropriateness_test_passed: true,
    annual_investment_cap_eur: 10000,
    ...opts?.profile,
  };
  let seq = 0;
  const subs: SubscriptionRow[] = (opts?.seed ?? []).map((s, i) => ({
    id: s.id ?? `seed_${i}`,
    tenant_id: TENANT,
    user_id: "user_1",
    investor_profile_id: "prof_1",
    deal_id: "deal_1",
    bond_tranche_id: "tr_1",
    amount_eur: 0,
    units: 0,
    unit_price_eur: 1000,
    settlement_currency: "EUR",
    status: "reserved",
    cooling_off_ends_at: null,
    withdrawn_at: null,
    esign_provider: null,
    esign_envelope_id: null,
    signed_at: null,
    reserved_at: new Date().toISOString(),
    funded_at: null,
    allocated_at: null,
    minted_at: null,
    refunded_at: null,
    ...s,
  }));
  const escrowMovements: { subscription_id: string; movement_type: string; status: string; amount_eur: number }[] = [];

  const store: SubscriptionStore & { _subs: SubscriptionRow[]; _escrow: typeof escrowMovements } = {
    _subs: subs,
    _escrow: escrowMovements,
    async findDealForSubscription(tenantId, dealId) {
      return deal.tenant_id === tenantId && deal.id === dealId ? deal : null;
    },
    async findProfile(ctx) {
      return profile.tenant_id === ctx.tenantId && profile.user_id === ctx.userId ? profile : null;
    },
    async sumActiveSubscriptionsSince(ctx, sinceIso) {
      const active = ["reserved", "signed", "funded", "allocated", "minted"];
      return subs
        .filter(
          (s) =>
            s.tenant_id === ctx.tenantId &&
            s.user_id === ctx.userId &&
            active.includes(s.status) &&
            s.reserved_at >= sinceIso,
        )
        .reduce((acc, s) => acc + s.amount_eur, 0);
    },
    async insertSubscription(ctx, row) {
      const r: SubscriptionRow = {
        id: `sub_${++seq}`,
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        investor_profile_id: row.investor_profile_id,
        deal_id: row.deal_id,
        bond_tranche_id: row.bond_tranche_id,
        amount_eur: row.amount_eur,
        units: row.units,
        unit_price_eur: row.unit_price_eur,
        settlement_currency: row.settlement_currency,
        status: "reserved",
        cooling_off_ends_at: null,
        withdrawn_at: null,
        esign_provider: null,
        esign_envelope_id: null,
        signed_at: null,
        reserved_at: new Date().toISOString(),
        funded_at: null,
        allocated_at: null,
        minted_at: null,
        refunded_at: null,
      };
      subs.push(r);
      return r;
    },
    async findSubscriptionById(ctx, id) {
      return subs.find((s) => s.tenant_id === ctx.tenantId && s.user_id === ctx.userId && s.id === id) ?? null;
    },
    async listSubscriptions(ctx) {
      return subs.filter((s) => s.tenant_id === ctx.tenantId && s.user_id === ctx.userId);
    },
    async updateSubscription(ctx, id, patch) {
      const s = subs.find((x) => x.tenant_id === ctx.tenantId && x.user_id === ctx.userId && x.id === id);
      if (!s) throw new Error("not_found");
      Object.assign(s, patch as Partial<SubscriptionRow>);
      return s;
    },
    async insertEscrowMovement(_tenantId, mv) {
      escrowMovements.push({
        subscription_id: mv.subscription_id,
        movement_type: mv.movement_type,
        status: mv.status ?? "pending",
        amount_eur: mv.amount_eur,
      });
      return { id: `mv_${escrowMovements.length}` };
    },
    async sumConfirmedDeposits(_tenantId, subscriptionId) {
      return escrowMovements
        .filter((m) => m.subscription_id === subscriptionId && m.movement_type === "deposit" && (m.status === "confirmed" || m.status === "reconciled"))
        .reduce((acc, m) => acc + m.amount_eur, 0);
    },
    async findSubscriptionByEnvelope(tenantId, envelopeId) {
      return subs.find((s) => s.tenant_id === tenantId && s.esign_envelope_id === envelopeId) ?? null;
    },
    async findSubscriptionByIdTenant(tenantId, id) {
      return subs.find((s) => s.tenant_id === tenantId && s.id === id) ?? null;
    },
    async updateSubscriptionByIdTenant(tenantId, id, patch) {
      const s = subs.find((x) => x.tenant_id === tenantId && x.id === id);
      if (!s) throw new Error("not_found");
      Object.assign(s, patch as Partial<SubscriptionRow>);
      return s;
    },
  };
  return store;
}

const ctx: SubscriptionCtx = { userId: "user_1", tenantId: TENANT, signerEmail: "u@example.com" };

// ─── Tests purs : plafond ECSP ──────────────────────────────────────────────────

describe("checkAnnualCap (pur)", () => {
  it("averti (cap null) : jamais plafonné", () => {
    const r = checkAnnualCap(null, 1_000_000, 500_000);
    expect(r.ok).toBe(true);
    expect(r.remainingEur).toBeNull();
  });
  it("non-averti : somme active + ticket ≤ plafond → ok", () => {
    const r = checkAnnualCap(10_000, 6_000, 4_000);
    expect(r.ok).toBe(true);
    expect(r.remainingEur).toBe(4_000);
  });
  it("non-averti : dépassement → ko avec capacité restante", () => {
    const r = checkAnnualCap(10_000, 8_000, 5_000);
    expect(r.ok).toBe(false);
    expect(r.remainingEur).toBe(2_000);
    expect(r.wouldBeEur).toBe(13_000);
  });
});

describe("isSuitable (pur)", () => {
  it("averti sans test → suitable", () => {
    expect(isSuitable({ investor_class: "sophisticated", appropriateness_test_passed: false } as ProfileForSubscription)).toBe(true);
  });
  it("non-averti avec test ECSP réussi → suitable", () => {
    expect(isSuitable({ investor_class: "non_sophisticated", appropriateness_test_passed: true } as ProfileForSubscription)).toBe(true);
  });
  it("non-averti sans test → non suitable", () => {
    expect(isSuitable({ investor_class: "non_sophisticated", appropriateness_test_passed: false } as ProfileForSubscription)).toBe(false);
  });
});

// ─── createSoftCommit : gardes ─────────────────────────────────────────────────

describe("createSoftCommit", () => {
  it("crée une souscription reserved (soft-commit, aucun versement)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    expect(sub.status).toBe("reserved");
    expect(sub.amountEur).toBe(4000);
    expect(sub.units).toBe(4); // 4000 / nominal 1000
    expect(sub.coolingOffEndsAt).toBeNull(); // pas de délai tant qu'aucun versement
    expect(store._subs).toHaveLength(1);
  });

  it("refuse si le deal n'est pas open", async () => {
    const store = memStore({ deal: { status: "closed" } });
    await expect(createSoftCommit(store, ctx, "deal_1", 4000)).rejects.toBeInstanceOf(ComplianceBlockedError);
    await expect(createSoftCommit(store, ctx, "deal_1", 4000)).rejects.toThrow(/deal_not_open/);
  });

  it("refuse si KYC non approuvé", async () => {
    const store = memStore({ profile: { kyc_status: "pending" } });
    await expect(createSoftCommit(store, ctx, "deal_1", 4000)).rejects.toThrow(/kyc_not_approved/);
  });

  it("refuse si suitability absente (non-averti sans test ECSP)", async () => {
    const store = memStore({ profile: { investor_class: "non_sophisticated", appropriateness_test_passed: false } });
    await expect(createSoftCommit(store, ctx, "deal_1", 4000)).rejects.toThrow(/suitability_required/);
  });

  it("refuse un ticket sous le minimum", async () => {
    const store = memStore();
    await expect(createSoftCommit(store, ctx, "deal_1", 500)).rejects.toThrow(/ticket_below_min/);
  });

  it("refuse un ticket au-dessus du maximum", async () => {
    const store = memStore();
    await expect(createSoftCommit(store, ctx, "deal_1", 60000)).rejects.toThrow(/ticket_above_max/);
  });

  it("refuse un deal introuvable (InvariantViolationError I3)", async () => {
    const store = memStore();
    await expect(createSoftCommit(store, ctx, "nope", 4000)).rejects.toBeInstanceOf(InvariantViolationError);
  });
});

// ─── Plafond ECSP 12 mois glissants ────────────────────────────────────────────

describe("createSoftCommit — plafond ECSP 12 mois glissants", () => {
  it("bloque quand somme active (12 mois) + ticket dépasse le plafond", async () => {
    // plafond 10000 ; déjà 8000 réservés récents → +5000 dépasse.
    const store = memStore({
      profile: { annual_investment_cap_eur: 10000 },
      seed: [{ amount_eur: 8000, status: "reserved", reserved_at: new Date().toISOString() }],
    });
    await expect(createSoftCommit(store, ctx, "deal_1", 5000)).rejects.toThrow(/annual_cap_exceeded/);
  });

  it("autorise quand une souscription ancienne (>12 mois) sort de la fenêtre", async () => {
    // 8000 réservés il y a 13 mois → HORS fenêtre → +5000 repasse sous le plafond.
    const old = new Date();
    old.setMonth(old.getMonth() - 13);
    const store = memStore({
      profile: { annual_investment_cap_eur: 10000 },
      seed: [{ amount_eur: 8000, status: "reserved", reserved_at: old.toISOString() }],
    });
    const sub = await createSoftCommit(store, ctx, "deal_1", 5000);
    expect(sub.status).toBe("reserved");
  });

  it("averti : aucun plafond même avec grosse somme active", async () => {
    const store = memStore({
      deal: { max_ticket_eur: 1_000_000 },
      profile: { investor_class: "professional", annual_investment_cap_eur: null },
      seed: [{ amount_eur: 500_000, status: "funded", reserved_at: new Date().toISOString() }],
    });
    const sub = await createSoftCommit(store, ctx, "deal_1", 200_000);
    expect(sub.status).toBe("reserved");
  });

  it("twelveMonthsAgoIso renvoie bien ~1 an en arrière", () => {
    const now = new Date("2026-06-05T00:00:00.000Z");
    expect(twelveMonthsAgoIso(now)).toBe("2025-06-05T00:00:00.000Z");
  });
});

// ─── Transitions pilotées par WEBHOOK (jamais par le client) ───────────────────

describe("transitions via webhooks", () => {
  it("applyEsignWebhook (SIGNED) : reserved → signed", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    // L'enveloppe est posée par requestSignature.
    await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    const env = store._subs[0].esign_envelope_id!;
    const event: ESignDomainEvent = { envelopeId: env, state: "SIGNED", docSha256: null, providerEventId: "e1" };
    const res = await applyEsignWebhook(store, TENANT, event);
    expect(res.matched).toBe(true);
    expect(res.newStatus).toBe("signed");
    expect(store._subs[0].status).toBe("signed");
    expect(store._subs[0].signed_at).not.toBeNull();
  });

  it("applyEsignWebhook ignore les états non SIGNED (no-op)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    const env = store._subs[0].esign_envelope_id!;
    const res = await applyEsignWebhook(store, TENANT, { envelopeId: env, state: "SENT", docSha256: null, providerEventId: "e2" });
    expect(res.matched).toBe(false);
    expect(store._subs[0].status).toBe("reserved");
  });

  it("applyEscrowWebhook (deposit_confirmed) : signed → funded", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    // reserved → signed (webhook esign)
    await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    const env = store._subs[0].esign_envelope_id!;
    await applyEsignWebhook(store, TENANT, { envelopeId: env, state: "SIGNED", docSha256: null, providerEventId: "e1" });
    // instruction de versement (pose le délai 4j)
    await instructFunding(store, ctx, fakeEscrow(), sub.id, { idempotencyKey: "k2" });
    // signed → funded (webhook escrow)
    const res = await applyEscrowWebhook(store, TENANT, {
      subscriptionId: sub.id,
      movementType: "deposit_confirmed",
      providerEventId: "x1",
    });
    expect(res.newStatus).toBe("funded");
    expect(store._subs[0].status).toBe("funded");
    expect(store._subs[0].funded_at).not.toBeNull();
  });

  it("applyEscrowWebhook deposit_confirmed sur un état non signed → no-op (jamais forcé)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000); // reserved
    const res = await applyEscrowWebhook(store, TENANT, {
      subscriptionId: sub.id,
      movementType: "deposit_confirmed",
      providerEventId: "x1",
    });
    // reserved ≠ signed → la machine ne fait PAS avancer ; statut inchangé.
    expect(res.newStatus).toBe("reserved");
    expect(store._subs[0].status).toBe("reserved");
  });
});

// ─── instructFunding : délai 4j + fail-soft ────────────────────────────────────

describe("instructFunding", () => {
  async function signedSub() {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    const env = store._subs[0].esign_envelope_id!;
    await applyEsignWebhook(store, TENANT, { envelopeId: env, state: "SIGNED", docSha256: null, providerEventId: "e1" });
    return { store, subId: sub.id };
  }

  it("pose cooling_off_ends_at ≈ now + 4j et crée un mouvement deposit pending", async () => {
    const { store, subId } = await signedSub();
    const before = Date.now();
    const res = await instructFunding(store, ctx, fakeEscrow(), subId, { idempotencyKey: "k2" });
    const end = new Date(res.coolingOffEndsAt).getTime();
    const expected = before + COOLING_OFF_DAYS * 86_400_000;
    expect(Math.abs(end - expected)).toBeLessThan(5000);
    expect(store._escrow.some((m) => m.movement_type === "deposit" && m.status === "pending")).toBe(true);
    // Le statut NE passe PAS funded ici (c'est le webhook qui le fera).
    expect(store._subs[0].status).toBe("signed");
  });

  it("exige l'état signed (refuse reserved)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000); // reserved
    await expect(instructFunding(store, ctx, fakeEscrow(), sub.id, { idempotencyKey: "k" })).rejects.toThrow(
      /funding_requires_signed/,
    );
  });

  it("fail-soft : escrow non configuré → ProviderUnavailableError (reste signed)", async () => {
    const { store, subId } = await signedSub();
    await expect(instructFunding(store, ctx, fakeEscrow(false), subId, { idempotencyKey: "k2" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(store._subs[0].status).toBe("signed");
  });
});

// ─── requestSignature : garde + fail-soft ──────────────────────────────────────

describe("requestSignature", () => {
  it("exige l'état reserved + mémorise l'enveloppe (sans passer à signed)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    const res = await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    expect(res.envelopeId).toContain("env_");
    expect(store._subs[0].esign_envelope_id).toBe(res.envelopeId);
    expect(store._subs[0].status).toBe("reserved"); // transition au webhook seulement
  });

  it("fail-soft : esign non configuré → ProviderUnavailableError", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    await expect(requestSignature(store, ctx, fakeEsign(false), sub.id, { idempotencyKey: "k" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});

// ─── cancel : annulation / rétractation pendant le délai 4j ─────────────────────

describe("cancel", () => {
  it("reserved → cancelled (avant tout versement)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    const res = await cancel(store, ctx, sub.id, fakeEscrow(), { idempotencyKey: "k" });
    expect(res.status).toBe("cancelled");
  });

  it("signed → withdrawn (rétractation eIDAS avant versement)", async () => {
    const store = memStore();
    const sub = await createSoftCommit(store, ctx, "deal_1", 4000);
    await requestSignature(store, ctx, fakeEsign(), sub.id, { idempotencyKey: "k" });
    const env = store._subs[0].esign_envelope_id!;
    await applyEsignWebhook(store, TENANT, { envelopeId: env, state: "SIGNED", docSha256: null, providerEventId: "e1" });
    const res = await cancel(store, ctx, sub.id, fakeEscrow(), { idempotencyKey: "k" });
    expect(res.status).toBe("withdrawn");
    expect(store._subs[0].withdrawn_at).not.toBeNull();
  });

  it("funded PENDANT le délai 4j → refunded + appel refund séquestre", async () => {
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const store = memStore({
      seed: [
        {
          id: "s_funded",
          amount_eur: 4000,
          units: 4,
          status: "funded",
          cooling_off_ends_at: future,
          funded_at: new Date().toISOString(),
        },
      ],
    });
    const escrow = fakeEscrow();
    const res = await cancel(store, ctx, "s_funded", escrow, { idempotencyKey: "k" });
    expect(res.status).toBe("refunded");
    expect(escrow.refunds).toBe(1);
    expect(store._escrow.some((m) => m.movement_type === "refund")).toBe(true);
  });

  it("funded HORS délai 4j → refus (cooling_off_expired), aucun refund", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const store = memStore({
      seed: [{ id: "s_funded", amount_eur: 4000, status: "funded", cooling_off_ends_at: past }],
    });
    const escrow = fakeEscrow();
    await expect(cancel(store, ctx, "s_funded", escrow, { idempotencyKey: "k" })).rejects.toThrow(/cooling_off_expired/);
    expect(escrow.refunds).toBe(0);
  });

  it("refus d'annulation d'un état non annulable (allocated)", async () => {
    const store = memStore({ seed: [{ id: "s_alloc", status: "allocated" }] });
    await expect(cancel(store, ctx, "s_alloc", fakeEscrow(), { idempotencyKey: "k" })).rejects.toThrow(
      /cancel_not_allowed/,
    );
  });
});

// ─── listMySubscriptions ───────────────────────────────────────────────────────

describe("listMySubscriptions", () => {
  it("renvoie les souscriptions du caller avec actions + délai", async () => {
    const store = memStore();
    await createSoftCommit(store, ctx, "deal_1", 4000);
    const list = await listMySubscriptions(store, ctx);
    expect(list).toHaveLength(1);
    expect(list[0].availableActions).toContain("sign");
    expect(list[0].availableActions).toContain("cancel");
    expect(list[0].withinCoolingOff).toBe(false);
  });
});
