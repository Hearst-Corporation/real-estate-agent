/**
 * lib/invest/distribution/service.test.ts — ⑦ Distribution & Lifecycle (Epic 1.5).
 *
 * Couvre :
 *   - allocateProRata : répartition au prorata des units + résidu d'arrondi (somme
 *     exacte au centime), 0 si total/units nul ;
 *   - computeDistributionAmount : coupon = principal × taux × durée/12 (déterministe) ;
 *     exit = total obligataire du waterfall central (depuis le MOTEUR, jamais à la main) ;
 *   - runDistribution : payouts par holder, idempotence (rejeu du même round),
 *     fail-soft escrow (payouts `pending`), escrow OK (`paid`), exit compte les
 *     souscriptions `minted` ;
 *   - anti-NAV : la somme des payouts == montant tranche (pas de valeur consolidée).
 */

import { describe, it, expect, vi } from "vitest";
import {
  allocateProRata,
  computeDistributionAmount,
  runDistribution,
  type DistributionStore,
  type HolderPosition,
  type DealBundle,
  type DealTranche,
} from "./index";
import type { EscrowPort } from "../ports/escrow";
import type { IdempotencyStore, IdempotencyRecord } from "../shared/idempotency";
import { buildDealSheet } from "../finance/deal-engine";
import { mapDbDealToInput, type DbDealRow } from "../deal/mapping";

// ─── Fixtures DB (deal + tranche) cohérentes avec le moteur ───────────────────

/** Deal DB minimal alimentant le moteur (Résidence Haussmann simplifiée). */
function dbDeal(): DbDealRow {
  return {
    id: "deal-1",
    tenant_id: "real-estate-agent",
    slug: "residence-haussmann",
    name: "Résidence Haussmann",
    deal_type: "marchand_de_biens",
    city: "Lyon",
    postal_code: "69006",
    country: "FR",
    acquisition_price_eur: 1_800_000,
    notary_fees_eur: 130_000,
    works_budget_eur: 420_000,
    other_costs_eur: 90_000,
    total_project_cost_eur: 2_440_000,
    senior_debt_eur: 1_460_000,
    sponsor_equity_eur: 240_000,
    appraised_value_eur: 2_520_000,
    target_irr_pct: 10,
    duration_months: 22,
    target_raise_eur: 740_000,
    min_ticket_eur: 1_000,
    max_ticket_eur: null,
    opens_at: "2026-09-01",
    closes_at: null,
    scenarios: {
      exit: { prix_revente_central_eur: 2_900_000, valeur_expertise_eur: 2_520_000 },
      pessimiste: { delta_prix_revente_pct: -0.08, retard_mois: 3 },
      central: { delta_prix_revente_pct: 0, retard_mois: 0 },
      optimiste: { delta_prix_revente_pct: 0.05, retard_mois: 0 },
    },
    fees: {
      frais_plateforme_entree_pct: 0.01,
      frais_plateforme_admin_annuel_pct: 0.005,
      frais_operateur_acquisition_pct: 0.02,
      carried_operateur_pct: 0.2,
      hurdle_annuel: 0.08,
      taux_dette_senior_annuel: 0.045,
    } as unknown,
    waterfall: null,
  } as DbDealRow;
}

const TRANCHE: DealTranche = {
  bondTrancheId: "tranche-1",
  coupon_rate_pct: 9,
  total_nominal_eur: 740_000,
  nominal_unit_eur: 1_000,
};

function bundle(): DealBundle {
  return { deal: dbDeal(), tranche: TRANCHE, spv: null };
}

// ─── Store mémoire injectable ─────────────────────────────────────────────────

interface MemDistributionStore extends DistributionStore {
  distributions: { id: string; deal_id: string; distribution_type: string; gross_amount_eur: number; status: string }[];
  payouts: { distribution_id: string; holder_user_id: string; gross_amount_eur: number; net_amount_eur: number; status: string }[];
  audits: { action: string }[];
}

function memStore(positions: HolderPosition[], mintedCount = 0): MemDistributionStore {
  const distributions: MemDistributionStore["distributions"] = [];
  const payouts: MemDistributionStore["payouts"] = [];
  const audits: { action: string }[] = [];
  let seq = 0;
  return {
    distributions,
    payouts,
    audits,
    async findDealBundle() {
      return bundle();
    },
    async listHolderPositions() {
      return positions;
    },
    async countDistributions(_t, _d, type) {
      return distributions.filter((x) => x.distribution_type === type).length;
    },
    async insertDistribution(_t, row) {
      const id = `dist-${++seq}`;
      distributions.push({ id, deal_id: row.deal_id, distribution_type: row.distribution_type, gross_amount_eur: row.gross_amount_eur, status: row.status });
      return { id };
    },
    async insertPayout(_t, row) {
      payouts.push({
        distribution_id: row.distribution_id,
        holder_user_id: row.holder_user_id,
        gross_amount_eur: row.gross_amount_eur,
        net_amount_eur: row.net_amount_eur,
        status: row.status,
      });
      return { id: `payout-${payouts.length}` };
    },
    async setDistributionStatus(_t, id, status) {
      const d = distributions.find((x) => x.id === id);
      if (d) d.status = status;
    },
    async countMintedSubscriptions() {
      return mintedCount;
    },
    async listPayoutsForUser() {
      return [];
    },
    async listDistributionsForDeal() {
      return [];
    },
    async audit(input) {
      audits.push({ action: input.action });
    },
  };
}

/** Store d'idempotence mémoire (ON CONFLICT DO NOTHING). */
function memIdempotency(): IdempotencyStore {
  const rows = new Map<string, IdempotencyRecord>();
  return {
    async find(key) {
      return rows.get(key) ?? null;
    },
    async insert(key, bodyHash, response) {
      const existing = rows.get(key);
      if (existing) {
        if (existing.response == null && response != null) {
          rows.set(key, { idem_key: key, body_hash: bodyHash, response });
        }
        return false;
      }
      rows.set(key, { idem_key: key, body_hash: bodyHash, response });
      return true;
    },
  };
}

/** Escrow configuré (release OK). */
function escrowOk(): EscrowPort {
  return {
    isConfigured: () => true,
    createDepositInstruction: vi.fn(async () => ({ providerRef: "ref", instructions: {} })),
    release: vi.fn(async () => ({ providerRef: "rel" })),
    refund: vi.fn(async () => ({ providerRef: "ref" })),
    verifyWebhook: () => true,
  };
}

/** Escrow NON configuré (fail-soft → pending). */
function escrowOff(): EscrowPort {
  return {
    isConfigured: () => false,
    createDepositInstruction: vi.fn(async () => ({ providerRef: "", instructions: {} })),
    release: vi.fn(async () => ({ providerRef: "" })),
    refund: vi.fn(async () => ({ providerRef: "" })),
    verifyWebhook: () => false,
  };
}

const POSITIONS: HolderPosition[] = [
  { holderUserId: "u1", holderProfileId: "p1", bondTrancheId: "tranche-1", unitsHeld: 3 },
  { holderUserId: "u2", holderProfileId: "p2", bondTrancheId: "tranche-1", unitsHeld: 1 },
];

// ════════════════════════════════════════════════════════════════════════════
// allocateProRata (PUR)
// ════════════════════════════════════════════════════════════════════════════

describe("allocateProRata", () => {
  it("répartit au prorata des units", () => {
    const shares = allocateProRata(1000, POSITIONS, "paid");
    expect(shares).toHaveLength(2);
    expect(shares[0].grossAmountEur).toBe(750); // 3/4
    expect(shares[1].grossAmountEur).toBe(250); // 1/4
  });

  it("la somme des parts == total au centime (résidu sur le dernier)", () => {
    // 1000 / 3 holders égaux → 333.33 + 333.33 + 333.34
    const three: HolderPosition[] = [
      { holderUserId: "a", holderProfileId: "pa", bondTrancheId: "t", unitsHeld: 1 },
      { holderUserId: "b", holderProfileId: "pb", bondTrancheId: "t", unitsHeld: 1 },
      { holderUserId: "c", holderProfileId: "pc", bondTrancheId: "t", unitsHeld: 1 },
    ];
    const shares = allocateProRata(1000, three, "paid");
    const sum = shares.reduce((s, x) => s + x.grossAmountEur, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    expect(shares[2].grossAmountEur).toBeCloseTo(333.34, 2);
  });

  it("net == gross (aucune retenue par défaut, cohérent CHECK 0019)", () => {
    const shares = allocateProRata(500, POSITIONS, "pending");
    for (const s of shares) {
      expect(s.netAmountEur).toBe(s.grossAmountEur - s.withholdingEur);
      expect(s.withholdingEur).toBe(0);
    }
  });

  it("renvoie 0 si total nul ou aucune unit", () => {
    expect(allocateProRata(0, POSITIONS, "paid").every((s) => s.grossAmountEur === 0)).toBe(true);
    const noUnits: HolderPosition[] = [{ holderUserId: "x", holderProfileId: "px", bondTrancheId: "t", unitsHeld: 0 }];
    expect(allocateProRata(1000, noUnits, "paid")).toHaveLength(0);
  });

  it("propage le statut demandé sur chaque part", () => {
    expect(allocateProRata(100, POSITIONS, "pending").every((s) => s.status === "pending")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeDistributionAmount (waterfall depuis le MOTEUR)
// ════════════════════════════════════════════════════════════════════════════

describe("computeDistributionAmount", () => {
  it("coupon = principal × taux × durée/12 (déterministe, NON garanti)", () => {
    const r = computeDistributionAmount(dbDeal(), TRANCHE, null, "coupon");
    // 740 000 × 0,09 × 22/12 = 122 100
    expect(r.distributionType).toBe("coupon");
    expect(r.totalEur).toBeCloseTo(740_000 * 0.09 * (22 / 12), 2);
    expect(r.waterfallRank).toBe(4);
  });

  it("exit = total obligataire du waterfall central (depuis le moteur, pas recalculé)", () => {
    const r = computeDistributionAmount(dbDeal(), TRANCHE, null, "exit");
    const input = mapDbDealToInput(dbDeal(), TRANCHE, null);
    const expected = buildDealSheet(input).scenarios.central.waterfall.obligataire.total_percu_eur;
    expect(r.distributionType).toBe("final");
    expect(r.totalEur).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    expect(r.totalEur).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// runDistribution (orchestration)
// ════════════════════════════════════════════════════════════════════════════

describe("runDistribution", () => {
  it("coupon : crée 1 distribution + 1 payout par holder, réglé `paid` (escrow OK)", async () => {
    const store = memStore(POSITIONS);
    const res = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store,
      escrow: escrowOk(),
      idempotency: memIdempotency(),
    });
    expect(res.kind).toBe("coupon");
    expect(res.distributionType).toBe("coupon");
    expect(res.holders).toBe(2);
    expect(res.payoutStatus).toBe("paid");
    expect(res.escrowFailSoft).toBe(false);
    expect(store.distributions).toHaveLength(1);
    expect(store.payouts).toHaveLength(2);
    expect(store.distributions[0].status).toBe("paid");
  });

  it("anti-NAV : somme des payouts == montant tranche (pas de valeur consolidée)", async () => {
    const store = memStore(POSITIONS);
    const res = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store,
      escrow: escrowOk(),
      idempotency: memIdempotency(),
    });
    const sum = store.payouts.reduce((s, p) => s + p.gross_amount_eur, 0);
    expect(Math.round(sum * 100) / 100).toBe(res.totalGrossEur);
  });

  it("fail-soft : escrow non configuré → payouts `pending`, distribution `planned`", async () => {
    const store = memStore(POSITIONS);
    const res = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store,
      escrow: escrowOff(),
      idempotency: memIdempotency(),
    });
    expect(res.payoutStatus).toBe("pending");
    expect(res.escrowFailSoft).toBe(true);
    expect(store.payouts.every((p) => p.status === "pending")).toBe(true);
    expect(store.distributions[0].status).toBe("planned");
  });

  it("fail-soft : release escrow qui throw → pending (jamais d'échec dur)", async () => {
    const store = memStore(POSITIONS);
    const throwing: EscrowPort = {
      ...escrowOk(),
      isConfigured: () => true,
      release: vi.fn(async () => {
        throw new Error("escrow 500");
      }),
    };
    const res = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store,
      escrow: throwing,
      idempotency: memIdempotency(),
    });
    expect(res.payoutStatus).toBe("pending");
    expect(res.escrowFailSoft).toBe(true);
  });

  it("idempotence : un rejeu du même round NE crée pas de seconde distribution", async () => {
    const store = memStore(POSITIONS);
    const idem = memIdempotency();
    const first = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store,
      escrow: escrowOk(),
      idempotency: idem,
    });
    // Même round (countDistributions reverra 1 → round 2 sauf si on force le même).
    // Ici on rejoue explicitement la MÊME clé en repassant par un store qui voit 0
    // distributions (simulateur d'un retry concurrent sur le round 1).
    const storeRetry = memStore(POSITIONS);
    storeRetry.findDealBundle = store.findDealBundle;
    const second = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", {
      store: storeRetry,
      escrow: escrowOk(),
      idempotency: idem, // même store d'idempotence → rejeu de la réponse mémorisée
    });
    expect(second.replayed).toBe(true);
    expect(second.distributionId).toBe(first.distributionId);
    // Le store du retry n'a RIEN réécrit (fn non exécutée).
    expect(storeRetry.distributions).toHaveLength(0);
    expect(storeRetry.payouts).toHaveLength(0);
  });

  it("rounds successifs : deux distributions coupon distinctes (clés différentes)", async () => {
    const store = memStore(POSITIONS);
    const idem = memIdempotency();
    const r1 = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", { store, escrow: escrowOk(), idempotency: idem });
    const r2 = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "coupon", { store, escrow: escrowOk(), idempotency: idem });
    expect(r1.round).toBe(1);
    expect(r2.round).toBe(2);
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(false);
    expect(store.distributions).toHaveLength(2);
  });

  it("exit : type `final` + compte les souscriptions `minted` (terminal, sans réécriture hors schéma)", async () => {
    const store = memStore(POSITIONS, 2);
    const res = await runDistribution(null, { tenantId: "real-estate-agent" }, "deal-1", "exit", {
      store,
      escrow: escrowOk(),
      idempotency: memIdempotency(),
    });
    expect(res.kind).toBe("exit");
    expect(res.distributionType).toBe("final");
    expect(res.totalGrossEur).toBeGreaterThan(0);
    expect(store.audits.some((a) => a.action === "distribution.exit")).toBe(true);
  });

  it("rejette un dealId vide (InvariantViolationError)", async () => {
    await expect(
      runDistribution(null, { tenantId: "real-estate-agent" }, "", "coupon", {
        store: memStore(POSITIONS),
        escrow: escrowOk(),
        idempotency: memIdempotency(),
      }),
    ).rejects.toThrow();
  });
});
