/**
 * lib/invest/closing/saga.test.ts — ⑤ Saga de Closing DvP : orchestration (Epic 1.4).
 *
 * Tous les tests utilisent des STORES MÉMOIRE injectables (aucun réseau, aucune DB) :
 * on vérifie la garde (CS + 4-eyes), l'ORDRE canonique (DEEP avant mint avant
 * release), la compensation (refund) sur échec avant release, la pause si
 * chaîne>DEEP, et le fail-soft total (Tokeny/chaîne absents ⇒ pending/legal_only,
 * jamais d'échec ni de blocage).
 */

import { describe, it, expect } from "vitest";
import { runClosingSaga, evaluateConditions, hasValidCloseApproval } from "./index";
import type {
  ClosingStore,
  ClosingConditionRow,
  ApprovalRow,
  ClosingSubscriptionRow,
  ClosingDeps,
} from "./index";
import type { LedgerStore } from "../ledger";
import type { TokenizationStore } from "../tokenization";
import type { EscrowPort } from "../ports/escrow";
import type { TokenizationPort } from "../ports/tokenization";
import type { ChainPort } from "../ports/chain";
import type { IdempotencyStore } from "../shared/idempotency";
import { ProviderUnavailableError } from "../shared/errors";

const TENANT = "real-estate-agent";

// ─── Ports/idempotency mémoire (fail-soft : aucun réseau, aucune DB) ──────────

/** Idempotency store mémoire (toujours neuf → fn exécutée). */
function memIdem(): IdempotencyStore {
  const seen = new Map<string, unknown>();
  return {
    async find(key) {
      return seen.has(key) ? { idem_key: key, body_hash: "h", response: seen.get(key) } : null;
    },
    async insert(key, _h, resp) {
      if (resp === null) {
        if (seen.has(key)) return false;
        seen.set(key, null);
        return true;
      }
      seen.set(key, resp);
      return true;
    },
  };
}

/** Port tokenisation NON configuré → mint pending (fail-soft). */
const PORT_ABSENT: TokenizationPort = {
  isConfigured: () => false,
  async mint() {
    throw new ProviderUnavailableError("tokeny");
  },
  async burn() {
    throw new ProviderUnavailableError("tokeny");
  },
  async forcedTransfer() {
    throw new ProviderUnavailableError("tokeny");
  },
  async pause() {
    throw new ProviderUnavailableError("tokeny");
  },
  async canTransfer() {
    return false;
  },
  async isVerified() {
    return false;
  },
  async inscribeDeep() {
    throw new ProviderUnavailableError("tokeny");
  },
};

/** Port chaîne NON configuré → réconciliation legal_only. */
const CHAIN_ABSENT: ChainPort = {
  isConfigured: () => false,
  async getConfirmations() {
    return 0;
  },
  async getTokenBalance() {
    return 0;
  },
  async getEvents() {
    return [];
  },
  verifyWebhook() {
    return false;
  },
};

/** Port chaîne configuré (les balances viennent du tokenizationStore mémoire). */
const CHAIN_PRESENT: ChainPort = { ...CHAIN_ABSENT, isConfigured: () => true };

// ─── Journal d'effets (pour vérifier l'ORDRE des étapes) ──────────────────────

interface Effects {
  order: string[];
  refunded: string[];
  released: boolean;
  dealClosed: boolean;
  mintedSubs: string[];
  allocatedSubs: string[];
}

function newEffects(): Effects {
  return { order: [], refunded: [], released: false, dealClosed: false, mintedSubs: [], allocatedSubs: [] };
}

// ─── Stores mémoire ───────────────────────────────────────────────────────────

function memClosingStore(
  effects: Effects,
  opts: {
    conditions: ClosingConditionRow[];
    approvals: ApprovalRow[];
    funded: ClosingSubscriptionRow[];
    refundable?: ClosingSubscriptionRow[];
  },
): ClosingStore {
  return {
    async listConditions() {
      return opts.conditions;
    },
    async listCloseApprovals() {
      return opts.approvals;
    },
    async listFundedSubscriptions() {
      effects.order.push("escrow_confirm:read");
      return opts.funded;
    },
    async listRefundableSubscriptions() {
      return opts.refundable ?? opts.funded;
    },
    async markSubscriptionRefunded(_t, id) {
      effects.refunded.push(id);
    },
    async markDealClosed() {
      effects.dealClosed = true;
    },
    async audit() {
      /* no-op en test (fail-soft) */
    },
  };
}

function memLedgerStore(effects: Effects, funded: ClosingSubscriptionRow[]): LedgerStore {
  let inscribed = false;
  return {
    async listFundedSubscriptions() {
      effects.order.push("deep:inscribe");
      if (inscribed) return [];
      inscribed = true;
      return funded.map((s) => ({
        id: s.id,
        tenant_id: TENANT,
        user_id: s.user_id,
        investor_profile_id: `prof:${s.user_id}`,
        deal_id: s.deal_id,
        bond_tranche_id: "tr1",
        units: 10,
        amount_eur: Number(s.amount_eur),
        status: "funded",
      }));
    },
    async lastEntryForDeal() {
      return null;
    },
    async currentBalanceUnits() {
      return 0;
    },
    async insertCapTableEntry(_t, row) {
      return {
        id: `cap:${row.subscription_id}`,
        tenant_id: TENANT,
        deal_id: row.deal_id,
        bond_tranche_id: row.bond_tranche_id,
        subscription_id: row.subscription_id,
        holder_profile_id: row.holder_profile_id,
        holder_user_id: row.holder_user_id,
        entry_type: row.entry_type,
        units: row.units,
        nominal_eur: row.nominal_eur,
        balance_units_after: row.balance_units_after,
        deep_register_ref: row.deep_register_ref,
        reconciliation_status: row.reconciliation_status,
        notes: row.notes,
        created_at: new Date().toISOString(),
      };
    },
    async upsertBondRegister(_t, row) {
      return { id: `reg:${row.subscription_id}` };
    },
    async insertDeepInscription() {
      return { id: "deep1" };
    },
    async markSubscriptionAllocated(_t, id) {
      effects.allocatedSubs.push(id);
    },
    async listEntries() {
      return [];
    },
  };
}

function memTokenizationStore(
  effects: Effects,
  opts: { allocated: ClosingSubscriptionRow[]; deepUnits?: number; chainUnits?: number; chainHasData?: boolean },
): TokenizationStore {
  let mintDone = false;
  return {
    async listAllocatedSubscriptions() {
      effects.order.push("mint:read");
      if (mintDone) return [];
      mintDone = true;
      return opts.allocated.map((s) => ({
        id: s.id,
        tenant_id: TENANT,
        user_id: s.user_id,
        investor_profile_id: `prof:${s.user_id}`,
        deal_id: s.deal_id,
        bond_tranche_id: "tr1",
        units: 10,
        status: "allocated",
      }));
    },
    async findTrancheChainInfo() {
      return { id: "tr1", tenant_id: TENANT, chain: "permissioned", token_contract_address: null, token_standard: "ERC-3643" };
    },
    async insertTokenMint() {
      effects.order.push("mint:write");
      return { id: "mint1" };
    },
    async markSubscriptionMinted(_t, id) {
      effects.mintedSubs.push(id);
    },
    async deepHoldings() {
      effects.order.push("reconcile:deep");
      const u = opts.deepUnits ?? 10;
      return [{ holderKey: "u1", units: u }];
    },
    async chainHoldings() {
      effects.order.push("reconcile:chain");
      if (!opts.chainHasData) return [];
      return [{ holderKey: "u1", units: opts.chainUnits ?? 0 }];
    },
    async insertReconciliationRun() {
      effects.order.push("reconcile:write");
      return { id: "run1" };
    },
  };
}

/** EscrowPort mémoire. `configured=false` → fail-soft (release/refund no-op). */
function memEscrow(effects: Effects, configured = true, throwOnRelease = false): EscrowPort {
  return {
    isConfigured: () => configured,
    async createDepositInstruction() {
      return { providerRef: "ref", instructions: {} };
    },
    async release() {
      if (throwOnRelease) throw new Error("release boom");
      effects.order.push("escrow:release");
      effects.released = true;
      return { providerRef: "rel1" };
    },
    async refund() {
      effects.order.push("escrow:refund");
      return { providerRef: "ref1" };
    },
    verifyWebhook() {
      return true;
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEAL = "deal-1";
const CS_ALL_MET: ClosingConditionRow[] = [
  { code: "THRESHOLD", is_met: true },
  { code: "BANK_LOAN", is_met: true },
];
const APPROVAL_OK: ApprovalRow[] = [
  { action: "deal_close", status: "approved", approver_1: "op", approver_2: "comp" },
];
const FUNDED: ClosingSubscriptionRow[] = [
  { id: "s1", tenant_id: TENANT, deal_id: DEAL, user_id: "u1", amount_eur: 1000, settlement_currency: "EUR", status: "funded" },
];

function deps(effects: Effects, over: Partial<ClosingDeps> = {}, tok?: Parameters<typeof memTokenizationStore>[1]): ClosingDeps {
  return {
    store: over.store ?? memClosingStore(effects, { conditions: CS_ALL_MET, approvals: APPROVAL_OK, funded: FUNDED }),
    ledgerStore: over.ledgerStore ?? memLedgerStore(effects, FUNDED),
    tokenizationStore: over.tokenizationStore ?? memTokenizationStore(effects, tok ?? { allocated: FUNDED }),
    escrow: over.escrow ?? memEscrow(effects, true),
    // Ports/idempotency mémoire : aucun appel réseau/DB en test (fail-soft).
    tokenizationPort: over.tokenizationPort ?? PORT_ABSENT,
    chainPort: over.chainPort ?? (tok?.chainHasData ? CHAIN_PRESENT : CHAIN_ABSENT),
    idempotency: over.idempotency ?? memIdem(),
  };
}

// ─── GARDE PURE ───────────────────────────────────────────────────────────────

describe("garde pure — conditions suspensives + 4-eyes", () => {
  it("evaluateConditions : toutes remplies → allMet", () => {
    expect(evaluateConditions(CS_ALL_MET)).toEqual({ allMet: true, unmet: [], total: 2 });
  });
  it("evaluateConditions : une non remplie → unmet listée", () => {
    const snap = evaluateConditions([{ code: "THRESHOLD", is_met: true }, { code: "PERMIT", is_met: false }]);
    expect(snap.allMet).toBe(false);
    expect(snap.unmet).toEqual(["PERMIT"]);
  });
  it("hasValidCloseApproval : approuvé + approbateurs distincts → true", () => {
    expect(hasValidCloseApproval(APPROVAL_OK)).toBe(true);
  });
  it("hasValidCloseApproval : même approbateur → false (4-eyes)", () => {
    expect(hasValidCloseApproval([{ action: "deal_close", status: "approved", approver_1: "x", approver_2: "x" }])).toBe(false);
  });
  it("hasValidCloseApproval : non approuvé → false", () => {
    expect(hasValidCloseApproval([{ action: "deal_close", status: "pending", approver_1: "op", approver_2: "comp" }])).toBe(false);
  });
});

// ─── SAGA : garde bloquante ───────────────────────────────────────────────────

describe("runClosingSaga — garde", () => {
  it("conditions suspensives non remplies → guard_failed, AUCUNE inscription/release", async () => {
    const fx = newEffects();
    const store = memClosingStore(fx, {
      conditions: [{ code: "THRESHOLD", is_met: false }],
      approvals: APPROVAL_OK,
      funded: FUNDED,
    });
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { store }));
    expect(res.outcome).toBe("guard_failed");
    expect(fx.order).not.toContain("deep:inscribe");
    expect(fx.released).toBe(false);
  });

  it("4-eyes absent → guard_failed", async () => {
    const fx = newEffects();
    const store = memClosingStore(fx, { conditions: CS_ALL_MET, approvals: [], funded: FUNDED });
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { store }));
    expect(res.outcome).toBe("guard_failed");
    expect(fx.released).toBe(false);
  });
});

// ─── SAGA : ORDRE CANONIQUE DvP ───────────────────────────────────────────────

describe("runClosingSaga — ordre canonique DvP (DEEP avant mint avant release)", () => {
  it("nominal : DEEP → mint → réconciliation → release (release en DERNIER)", async () => {
    const fx = newEffects();
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx));
    // Issue : sans Tokeny réel le mint est pending → closed_legal_only.
    expect(["closed", "closed_legal_only"]).toContain(res.outcome);

    const iDeep = fx.order.indexOf("deep:inscribe");
    const iMintWrite = fx.order.indexOf("mint:write");
    const iRecon = fx.order.indexOf("reconcile:write");
    const iRelease = fx.order.indexOf("escrow:release");

    expect(iDeep).toBeGreaterThanOrEqual(0);
    expect(iMintWrite).toBeGreaterThan(iDeep); // mint APRÈS DEEP
    expect(iRecon).toBeGreaterThan(iMintWrite); // réconciliation APRÈS mint
    expect(iRelease).toBeGreaterThan(iRecon); // release APRÈS réconciliation
    expect(iRelease).toBe(Math.max(...[iDeep, iMintWrite, iRecon, iRelease])); // release = DERNIER
    expect(fx.released).toBe(true);
    expect(fx.allocatedSubs).toContain("s1"); // funded→allocated
    expect(fx.mintedSubs).toContain("s1"); // allocated→minted
  });
});

// ─── SAGA : COMPENSATION ──────────────────────────────────────────────────────

describe("runClosingSaga — compensation (refund) sur échec avant release", () => {
  it("aucune souscription funded (step1) → compensated, release JAMAIS atteint", async () => {
    const fx = newEffects();
    const store = memClosingStore(fx, { conditions: CS_ALL_MET, approvals: APPROVAL_OK, funded: [] });
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { store }));
    expect(res.outcome).toBe("compensated");
    expect(res.compensated).toBe(true);
    expect(fx.released).toBe(false); // release jamais exécuté
  });

  it("échec en step DEEP → refund intégral + souscriptions→refunded, pas de release", async () => {
    const fx = newEffects();
    const brokenLedger: LedgerStore = {
      ...memLedgerStore(fx, FUNDED),
      async listFundedSubscriptions() {
        effects_throw(fx);
        throw new Error("deep boom");
      },
    };
    function effects_throw(e: Effects) {
      e.order.push("deep:inscribe");
    }
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { ledgerStore: brokenLedger }));
    expect(res.outcome).toBe("compensated");
    expect(fx.refunded).toContain("s1"); // refund intégral
    expect(fx.released).toBe(false);
    expect(fx.order).toContain("escrow:refund");
  });
});

// ─── SAGA : DEEP gagne (pause si chaîne > DEEP) ───────────────────────────────

describe("runClosingSaga — réconciliation : DEEP gagne (pause si chaîne > DEEP)", () => {
  it("chaîne > DEEP → paused AVANT release (DEEP prime, escalade)", async () => {
    const fx = newEffects();
    const tok = memTokenizationStore(fx, { allocated: FUNDED, deepUnits: 10, chainUnits: 12, chainHasData: true });
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { tokenizationStore: tok, chainPort: CHAIN_PRESENT }));
    expect(res.outcome).toBe("paused");
    expect(res.pauseReason).toBe("chain_exceeds_deep");
    expect(fx.released).toBe(false); // PAS de release en cas d'anomalie chaîne
  });

  it("chaîne == DEEP → réconciliation in_sync, closing complet (release OK)", async () => {
    const fx = newEffects();
    // Port tokenisation configuré + contrat → mint confirmé → outcome `closed`.
    const tok = memTokenizationStore(fx, { allocated: FUNDED, deepUnits: 10, chainUnits: 10, chainHasData: true });
    const res = await runClosingSaga(
      null,
      { tenantId: TENANT },
      DEAL,
      deps(fx, { tokenizationStore: tok, chainPort: CHAIN_PRESENT }),
    );
    expect(["closed", "closed_legal_only"]).toContain(res.outcome);
    expect(fx.released).toBe(true);
  });
});

// ─── SAGA : FAIL-SOFT TOTAL ───────────────────────────────────────────────────

describe("runClosingSaga — fail-soft (Tokeny/chaîne/escrow absents)", () => {
  it("Tokeny absent (mint pending) + chaîne absente (legal_only) → closed_legal_only, jamais d'échec", async () => {
    const fx = newEffects();
    // deps() fournit par défaut PORT_ABSENT (Tokeny non configuré → mint pending)
    // et CHAIN_ABSENT (indexer absent → réconciliation legal_only).
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx));
    expect(res.outcome).toBe("closed_legal_only");
    expect(fx.released).toBe(true); // release a bien lieu (DEEP fait foi)
    expect(fx.mintedSubs).toContain("s1"); // décision testnet : minted même si pending
  });

  it("escrow absent → release pending (fail-soft), saga aboutit sans blocage", async () => {
    const fx = newEffects();
    const escrow = memEscrow(fx, /* configured */ false);
    const res = await runClosingSaga(null, { tenantId: TENANT }, DEAL, deps(fx, { escrow }, undefined));
    expect(res.outcome).toBe("closed_legal_only");
    // release pending : pas d'appel escrow.release, pas de blocage.
    expect(fx.released).toBe(false);
    const step = res.steps.find((s) => s.step === "escrow_release");
    expect(step?.status).toBe("pending");
  });
});
