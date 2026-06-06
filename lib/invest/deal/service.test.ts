/**
 * lib/invest/deal/service.test.ts — services deal DB-backed (Epic 1.2).
 *
 * Testés via un `DealStore` EN MÉMOIRE (aucun réseau, aucune DB) :
 *   - listDeals : filtrage par statut + assertion tenant ;
 *   - getDealBySlug : mapping + buildDealSheet + GATE KYC (chiffres détaillés
 *     masqués si viewer non KYC-approuvé) ;
 *   - createDealWithSpv : garde opérateur/admin (403 sinon), 1 SPV = 1 deal ;
 *   - updateDeal : garde + tenant + maj ;
 *   - publishDeal : draft→open uniquement si KIIS publié (ComplianceBlockedError) ;
 *   - attachDealDocument : garde + insertion data room ;
 *   - gateDealSheet : pureté + neutralisation des sections sensibles.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  listDeals,
  getDealBySlug,
  createDealWithSpv,
  updateDeal,
  publishDeal,
  attachDealDocument,
  gateDealSheet,
  dealCreateIdemKey,
  type DealStore,
  type DealViewerCtx,
  type OperatorCtx,
  type CreateDealInput,
  type DealDocument,
} from "./service";
import type { DbDealRow, DbTrancheRow } from "./mapping";
import { ComplianceBlockedError, InvariantViolationError } from "../shared/errors";
import { buildDealSheet, RESIDENCE_HAUSSMANN } from "../finance";

// ─── Store en mémoire ─────────────────────────────────────────────────────────

interface MemTranche extends DbTrancheRow {
  deal_id: string;
  name: string;
  seniority: string;
  is_variable_return: boolean;
  token_standard: string;
}

function memStore() {
  const deals: (DbDealRow & {
    spv_id: string;
    status: string;
    offering_regime: string;
    raised_eur: number;
    ltv_pct: number | null;
    badges: string[];
    restricted_to_sophisticated: boolean;
    settlement_currency: string;
  })[] = [];
  const tranches: MemTranche[] = [];
  const spvs: { id: string; tenant_id: string; legal_name: string; legal_form: string; senior_debt_amount_eur: number | null }[] = [];
  const operators: { id: string; tenant_id: string; user_id: string }[] = [];
  const docs: (DealDocument & { tenant_id: string; deal_id: string })[] = [];
  const publishedKiisDeals = new Set<string>();
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;

  const store: DealStore & {
    _markKiisPublished(dealId: string): void;
    _deals: typeof deals;
  } = {
    _deals: deals,
    _markKiisPublished(dealId: string) {
      publishedKiisDeals.add(dealId);
    },

    async listDeals(tenantId, filters) {
      return deals.filter(
        (d) =>
          d.tenant_id === tenantId &&
          (!filters.statuses || filters.statuses.includes(d.status)) &&
          (!filters.dealType || d.deal_type === filters.dealType),
      );
    },
    async findDealBySlug(tenantId, slug) {
      return deals.find((d) => d.tenant_id === tenantId && d.slug === slug) ?? null;
    },
    async findDealById(tenantId, dealId) {
      return deals.find((d) => d.tenant_id === tenantId && d.id === dealId) ?? null;
    },
    async findTrancheByDeal(tenantId, dealId) {
      const t = tranches.find((x) => x.deal_id === dealId);
      return t ? { coupon_rate_pct: t.coupon_rate_pct, total_nominal_eur: t.total_nominal_eur, nominal_unit_eur: t.nominal_unit_eur } : null;
    },
    async findTrancheFull(tenantId, dealId) {
      const t = tranches.find((x) => x.deal_id === dealId);
      return t
        ? {
            name: t.name,
            seniority: t.seniority,
            coupon_rate_pct: t.coupon_rate_pct,
            is_variable_return: t.is_variable_return,
            token_standard: t.token_standard,
            nominal_unit_eur: t.nominal_unit_eur,
            total_nominal_eur: t.total_nominal_eur,
          }
        : null;
    },
    async findSpvById(tenantId, spvId) {
      const s = spvs.find((x) => x.id === spvId && x.tenant_id === tenantId);
      return s ? { id: s.id, legal_name: s.legal_name, legal_form: s.legal_form, senior_debt_amount_eur: s.senior_debt_amount_eur } : null;
    },
    async listDealDocuments(tenantId, dealId) {
      return docs
        .filter((d) => d.tenant_id === tenantId && d.deal_id === dealId)
        .map(({ tenant_id: _t, deal_id: _d, ...rest }) => rest);
    },
    async resolveOperatorId(tenantId, userId) {
      const found = operators.find((o) => o.tenant_id === tenantId && o.user_id === userId);
      if (found) return found.id;
      const row = { id: id("op"), tenant_id: tenantId, user_id: userId };
      operators.push(row);
      return row.id;
    },
    async createSpvDealTranche(tenantId, operatorId, payload) {
      const spvId = id("spv");
      spvs.push({
        id: spvId,
        tenant_id: tenantId,
        legal_name: payload.spv.legalName,
        legal_form: payload.spv.legalForm ?? "SAS",
        senior_debt_amount_eur: payload.spv.seniorDebtAmountEur ?? payload.deal.seniorDebtEur,
      });
      // 1 SPV = 1 deal : refuse un 2e deal sur le même SPV (ici via slug unique).
      if (deals.some((d) => d.tenant_id === tenantId && d.slug === payload.deal.slug)) {
        throw new Error("duplicate key value violates unique constraint uq_inv_deal_slug");
      }
      const totalCost =
        payload.deal.acquisitionPriceEur + payload.deal.notaryFeesEur + payload.deal.worksBudgetEur + payload.deal.otherCostsEur;
      const dealId = id("deal");
      const row = {
        id: dealId,
        tenant_id: tenantId,
        spv_id: spvId,
        slug: payload.deal.slug,
        name: payload.deal.name,
        deal_type: payload.deal.dealType,
        city: payload.deal.city ?? null,
        postal_code: payload.deal.postalCode ?? null,
        country: "FR",
        acquisition_price_eur: payload.deal.acquisitionPriceEur,
        notary_fees_eur: payload.deal.notaryFeesEur,
        works_budget_eur: payload.deal.worksBudgetEur,
        other_costs_eur: payload.deal.otherCostsEur,
        total_project_cost_eur: totalCost,
        senior_debt_eur: payload.deal.seniorDebtEur,
        sponsor_equity_eur: payload.deal.sponsorEquityEur,
        appraised_value_eur: payload.deal.appraisedValueEur ?? null,
        target_irr_pct: null,
        duration_months: payload.deal.durationMonths,
        target_raise_eur: payload.deal.targetRaiseEur,
        min_ticket_eur: payload.deal.minTicketEur ?? 1000,
        max_ticket_eur: payload.deal.maxTicketEur ?? null,
        opens_at: null,
        closes_at: null,
        scenarios: { exit: { prix_revente_central_eur: payload.deal.prixReventeCentralEur ?? totalCost } },
        fees: { taux_dette_senior_annuel: payload.deal.seniorRateAnnual ?? 0.045 },
        waterfall: [],
        status: "draft",
        offering_regime: "private_placement",
        raised_eur: 0,
        ltv_pct: null,
        badges: [],
        restricted_to_sophisticated: false,
        settlement_currency: payload.deal.settlementCurrency ?? "EUR",
      };
      deals.push(row);
      const nominalUnit = payload.tranche.nominalUnitEur ?? 1000;
      const units = Math.max(1, Math.round(payload.deal.targetRaiseEur / nominalUnit));
      tranches.push({
        deal_id: dealId,
        name: payload.tranche.name,
        seniority: payload.tranche.seniority ?? "senior_secured",
        coupon_rate_pct: payload.tranche.couponRatePct ?? null,
        is_variable_return: true,
        token_standard: payload.tranche.tokenStandard ?? "ERC-3643",
        nominal_unit_eur: nominalUnit,
        total_nominal_eur: units * nominalUnit,
      });
      return row;
    },
    async updateDeal(tenantId, dealId, patch) {
      const row = deals.find((d) => d.tenant_id === tenantId && d.id === dealId);
      if (!row) throw new Error("not_found");
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.badges !== undefined) row.badges = patch.badges;
      if (patch.targetRaiseEur !== undefined) row.target_raise_eur = patch.targetRaiseEur;
      return row;
    },
    async getDealStatus(tenantId, dealId) {
      return deals.find((d) => d.tenant_id === tenantId && d.id === dealId)?.status ?? null;
    },
    async hasPublishedKiis(tenantId, dealId) {
      return publishedKiisDeals.has(dealId);
    },
    async setDealStatus(tenantId, dealId, status) {
      const row = deals.find((d) => d.tenant_id === tenantId && d.id === dealId);
      if (!row) throw new Error("not_found");
      row.status = status;
      return row;
    },
    async insertDocument(tenantId, dealId, userId, doc) {
      const d: DealDocument & { tenant_id: string; deal_id: string } = {
        tenant_id: tenantId,
        deal_id: dealId,
        id: id("doc"),
        docType: doc.doc_type,
        title: doc.title,
        mimeType: doc.mime_type ?? null,
        sizeBytes: doc.size_bytes ?? null,
        contentSha256: doc.content_sha256 ?? null,
        version: 1,
        isSigned: false,
        createdAt: new Date().toISOString(),
      };
      docs.push(d);
      const { tenant_id: _t, deal_id: _d, ...rest } = d;
      return rest;
    },
  };
  return store;
}

const TENANT = "real-estate-agent";

function operatorCtx(role = "admin"): OperatorCtx {
  return { userId: "user-op", tenantId: TENANT, role, scope: role === "admin" ? ["admin"] : [] };
}

function investorCtx(kycApproved: boolean): DealViewerCtx {
  return { userId: "user-inv", tenantId: TENANT, kycApproved };
}

const baseCreate: CreateDealInput = {
  spv: { legalName: "Haussmann SAS" },
  deal: {
    slug: "haussmann-lyon6",
    name: "Résidence Haussmann — Lyon 6",
    dealType: "marchand_de_biens",
    city: "Lyon",
    acquisitionPriceEur: 1_800_000,
    notaryFeesEur: 130_000,
    worksBudgetEur: 420_000,
    otherCostsEur: 90_000,
    seniorDebtEur: 1_460_000,
    sponsorEquityEur: 240_000,
    appraisedValueEur: 2_520_000,
    targetRaiseEur: 740_000,
    durationMonths: 22,
    prixReventeCentralEur: 2_900_000,
    seniorRateAnnual: 0.045,
  },
  tranche: { name: "Obligations 2026-A", couponRatePct: 9 },
};

describe("createDealWithSpv", () => {
  let store: ReturnType<typeof memStore>;
  beforeEach(() => {
    store = memStore();
  });

  it("refuse un appelant non opérateur/admin (ComplianceBlockedError)", async () => {
    await expect(
      createDealWithSpv(store, { userId: "u", tenantId: TENANT, role: "user", scope: ["read", "write"] }, baseCreate),
    ).rejects.toBeInstanceOf(ComplianceBlockedError);
  });

  it("crée un deal + SPV + tranche pour un opérateur", async () => {
    const deal = await createDealWithSpv(store, operatorCtx(), baseCreate);
    expect(deal.slug).toBe("haussmann-lyon6");
    expect(deal.status).toBe("draft");
    expect(deal.targetRaiseEur).toBe(740_000);
    expect(store._deals).toHaveLength(1);
  });

  it("autorise aussi un rôle 'operator' (scope)", async () => {
    const ctx: OperatorCtx = { userId: "u", tenantId: TENANT, role: "operator", scope: [] };
    const deal = await createDealWithSpv(store, ctx, baseCreate);
    expect(deal.slug).toBe("haussmann-lyon6");
  });

  it("1 SPV = 1 deal : un slug déjà pris est rejeté", async () => {
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    await expect(createDealWithSpv(store, operatorCtx(), baseCreate)).rejects.toThrow(/uq_inv_deal_slug/);
  });

  it("dealCreateIdemKey est déterministe et préfixé deal:create:", () => {
    const k1 = dealCreateIdemKey(baseCreate);
    const k2 = dealCreateIdemKey(baseCreate);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^deal:create:[a-f0-9]{16}$/);
  });
});

describe("listDeals + getDealBySlug (gate KYC)", () => {
  let store: ReturnType<typeof memStore>;
  beforeEach(async () => {
    store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    // Ouvre le deal pour qu'il apparaisse côté investisseur.
    const dealId = store._deals[0].id;
    await store.setDealStatus(TENANT, dealId, "open");
  });

  it("listDeals filtre par statut", async () => {
    const open = await listDeals(store, TENANT, { statuses: ["open"] });
    expect(open).toHaveLength(1);
    const drafts = await listDeals(store, TENANT, { statuses: ["draft"] });
    expect(drafts).toHaveLength(0);
  });

  it("getDealBySlug renvoie un DealSheet complet + tranche + spv (viewer KYC)", async () => {
    const detail = await getDealBySlug(store, investorCtx(true), "haussmann-lyon6");
    expect(detail).not.toBeNull();
    expect(detail!.kycGated).toBe(false);
    expect(detail!.sheet.charts.g3_waterfall.steps.length).toBeGreaterThan(0);
    expect(detail!.sheet.charts.g5_scenarios.barres.length).toBe(3);
    expect(detail!.tranche?.couponRatePct).toBe(9);
    expect(detail!.spv?.legalName).toBe("Haussmann SAS");
  });

  it("GATE KYC : viewer non approuvé → chiffres détaillés masqués", async () => {
    const detail = await getDealBySlug(store, investorCtx(false), "haussmann-lyon6");
    expect(detail!.kycGated).toBe(true);
    // Détails neutralisés.
    expect(detail!.sheet.charts.g3_waterfall.steps).toHaveLength(0);
    expect(detail!.sheet.charts.g6_sensibilite_prix.points).toHaveLength(0);
    expect(detail!.sheet.charts.g8_cashflow.points).toHaveLength(0);
    // Scénarios réduits au central.
    expect(detail!.sheet.charts.g5_scenarios.barres).toHaveLength(1);
    expect(detail!.sheet.charts.g5_scenarios.barres[0].key).toBe("central");
    // Structure conservée (use of funds non vidé, LTV présente).
    expect(detail!.sheet.charts.g2_use_of_funds.segments.length).toBeGreaterThan(0);
    expect(detail!.sheet.metrics.ltv).toBeGreaterThan(0);
  });

  it("getDealBySlug renvoie null pour un slug inconnu", async () => {
    const detail = await getDealBySlug(store, investorCtx(true), "inexistant");
    expect(detail).toBeNull();
  });
});

describe("updateDeal", () => {
  it("refuse un non opérateur, applique le patch pour un opérateur", async () => {
    const store = memStore();
    const created = await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;

    await expect(
      updateDeal(store, { userId: "u", tenantId: TENANT, role: "user", scope: [] }, dealId, { name: "X" }),
    ).rejects.toBeInstanceOf(ComplianceBlockedError);

    const updated = await updateDeal(store, operatorCtx(), dealId, { name: "Nouveau nom", badges: ["a", "b"] });
    expect(updated.name).toBe("Nouveau nom");
    expect(updated.badges).toEqual(["a", "b"]);
    void created;
  });

  it("404 (InvariantViolationError) si le deal n'existe pas", async () => {
    const store = memStore();
    await expect(updateDeal(store, operatorCtx(), "nope", { name: "X" })).rejects.toBeInstanceOf(
      InvariantViolationError,
    );
  });
});

describe("publishDeal (garde KIIS)", () => {
  it("bloque la publication sans KIIS publié", async () => {
    const store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;
    await expect(publishDeal(store, operatorCtx(), dealId)).rejects.toBeInstanceOf(ComplianceBlockedError);
    await expect(publishDeal(store, operatorCtx(), dealId)).rejects.toThrow(/kiis_not_published/);
  });

  it("publie draft→open une fois le KIIS publié", async () => {
    const store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;
    store._markKiisPublished(dealId);
    const deal = await publishDeal(store, operatorCtx(), dealId);
    expect(deal.status).toBe("open");
  });

  it("refuse la publication depuis un statut non 'draft'", async () => {
    const store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;
    store._markKiisPublished(dealId);
    await publishDeal(store, operatorCtx(), dealId); // → open
    await expect(publishDeal(store, operatorCtx(), dealId)).rejects.toThrow(/deal_not_publishable_from_status/);
  });
});

describe("attachDealDocument", () => {
  it("ajoute un document à la data room (opérateur)", async () => {
    const store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;
    const doc = await attachDealDocument(store, operatorCtx(), dealId, {
      docType: "appraisal",
      title: "Expertise de valeur",
      storageKey: "invest/deals/x/expertise.pdf",
      contentSha256: "a".repeat(64),
    });
    expect(doc.title).toBe("Expertise de valeur");
    const list = await store.listDealDocuments(TENANT, dealId);
    expect(list).toHaveLength(1);
  });

  it("refuse un non opérateur", async () => {
    const store = memStore();
    await createDealWithSpv(store, operatorCtx(), baseCreate);
    const dealId = store._deals[0].id;
    await expect(
      attachDealDocument(store, { userId: "u", tenantId: TENANT, role: "user", scope: [] }, dealId, {
        docType: "other",
        title: "x",
        storageKey: "k",
      }),
    ).rejects.toBeInstanceOf(ComplianceBlockedError);
  });
});

describe("gateDealSheet (pur)", () => {
  it("ne mute pas l'entrée et neutralise les sections sensibles", () => {
    const sheet = buildDealSheet(RESIDENCE_HAUSSMANN);
    const before = JSON.stringify(sheet);
    const gated = gateDealSheet(sheet);
    // Pureté : l'original est intact.
    expect(JSON.stringify(sheet)).toBe(before);
    // Neutralisation.
    expect(gated.charts.g3_waterfall.steps).toHaveLength(0);
    expect(gated.charts.g6_sensibilite_prix.points).toHaveLength(0);
    expect(gated.charts.g7_sensibilite_retard.points).toHaveLength(0);
    expect(gated.charts.g8_cashflow.points).toHaveLength(0);
    expect(gated.charts.g5_scenarios.barres).toHaveLength(1);
    // Le rendement cible (central) reste exposé (cadre « non garanti »).
    expect(gated.rendement_cible_irr).toBe(sheet.rendement_cible_irr);
  });
});
