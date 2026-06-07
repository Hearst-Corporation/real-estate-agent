/**
 * lib/invest/deal/mapping.test.ts — mapping DB → DealInput (Epic 1.2).
 *
 * Vérifie que `mapDbDealToInput` câble correctement les colonnes RÉELLES de
 * inv_deals/inv_bond_tranches/inv_spvs vers le contrat du moteur financier, que
 * les jsonb (scenarios/fees/exit) sont lus, que les défauts documentés
 * s'appliquent, que les % DB deviennent des ratios, et que le DealSheet se
 * construit sur la sortie (le moteur reste pur et n'est pas modifié).
 */

import { describe, it, expect } from "vitest";
import {
  mapDbDealToInput,
  mapOperationType,
  readScenarios,
  readFees,
  readSeniorRate,
  DEFAULT_FEES,
  DEFAULT_SCENARIOS,
  DEFAULT_DURATION_MONTHS,
  DEFAULT_SENIOR_RATE,
  type DbDealRow,
  type DbTrancheRow,
  type DbSpvRow,
} from "./mapping";
import { buildDealSheet } from "../finance/deal-engine";

/** Deal DB minimal "Résidence Haussmann" (chiffres de la fixture). */
function dbDeal(overrides: Partial<DbDealRow> = {}): DbDealRow {
  return {
    id: "uuid-deal-1",
    tenant_id: "real-estate-agent",
    slug: "residence-haussmann-lyon6",
    name: "Résidence Haussmann — Lyon 6",
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
    max_ticket_eur: 100_000,
    opens_at: "2026-09-01T00:00:00Z",
    closes_at: null,
    scenarios: { exit: { prix_revente_central_eur: 2_900_000, valeur_expertise_eur: 2_520_000 } },
    fees: { taux_dette_senior_annuel: 0.045 },
    waterfall: [],
    ...overrides,
  };
}

const tranche: DbTrancheRow = {
  coupon_rate_pct: 9,
  total_nominal_eur: 740_000,
  nominal_unit_eur: 1_000,
};

const spv: DbSpvRow = { senior_debt_amount_eur: 1_460_000 };

describe("mapDbDealToInput", () => {
  it("câble les postes de coût depuis les colonnes inv_deals", () => {
    const input = mapDbDealToInput(dbDeal(), tranche, spv);
    expect(input.costs).toEqual({
      prix_acquisition_eur: 1_800_000,
      frais_notaire_eur: 130_000,
      budget_travaux_eur: 420_000,
      frais_divers_portage_eur: 90_000,
    });
  });

  it("câble le financement (obligations = tranche, coupon % → ratio)", () => {
    const input = mapDbDealToInput(dbDeal(), tranche, spv);
    expect(input.funding.dette_senior_eur).toBe(1_460_000);
    expect(input.funding.equity_sponsor_eur).toBe(240_000);
    expect(input.funding.obligations_cible_eur).toBe(740_000);
    // 9 % DB → 0.09 ratio moteur.
    expect(input.funding.taux_coupon_obligataire_annuel).toBeCloseTo(0.09, 10);
    // Taux senior lu depuis le jsonb fees.
    expect(input.funding.taux_dette_senior_annuel).toBeCloseTo(0.045, 10);
  });

  it("lit le prix de revente + valeur d'expertise depuis scenarios.exit (jsonb)", () => {
    const input = mapDbDealToInput(dbDeal(), tranche, spv);
    expect(input.exit.prix_revente_central_eur).toBe(2_900_000);
    expect(input.exit.valeur_expertise_eur).toBe(2_520_000);
  });

  it("retombe sur target_raise pour les obligations si pas de tranche", () => {
    const input = mapDbDealToInput(dbDeal(), null, spv);
    expect(input.funding.obligations_cible_eur).toBe(740_000);
    // Pas de coupon connu sans tranche → 0 (jamais une promesse).
    expect(input.funding.taux_coupon_obligataire_annuel).toBe(0);
  });

  it("applique les défauts documentés quand les jsonb/colonnes sont absents", () => {
    const bare = dbDeal({
      total_project_cost_eur: null,
      duration_months: null,
      appraised_value_eur: null,
      scenarios: null,
      fees: null,
      opens_at: null,
    });
    const input = mapDbDealToInput(bare, null, null);
    // Coût total recalculé depuis les postes.
    const cout = 1_800_000 + 130_000 + 420_000 + 90_000;
    expect(input.funding.taux_dette_senior_annuel).toBe(DEFAULT_SENIOR_RATE);
    expect(input.schedule.duree_mois).toBe(DEFAULT_DURATION_MONTHS);
    expect(input.scenarios).toEqual(DEFAULT_SCENARIOS);
    expect(input.fees).toEqual(DEFAULT_FEES);
    // Sans exit explicite → revente = coût total (marge 0, conservateur).
    expect(input.exit.prix_revente_central_eur).toBe(cout);
    // date_closing par défaut = aujourd'hui (format YYYY-MM-DD).
    expect(input.schedule.date_closing).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("mappe deal_type DB (5 valeurs) → OperationType moteur (3 valeurs)", () => {
    expect(mapOperationType("locatif")).toBe("locatif");
    expect(mapOperationType("promotion")).toBe("promotion");
    expect(mapOperationType("marchand_de_biens")).toBe("marchand_de_biens");
    // value_add / mixte → marchand_de_biens (gain in fine, documenté).
    expect(mapOperationType("value_add")).toBe("marchand_de_biens");
    expect(mapOperationType("mixte")).toBe("marchand_de_biens");
  });

  it("produit un DealInput qui construit un DealSheet sans erreur (moteur pur)", () => {
    const input = mapDbDealToInput(dbDeal(), tranche, spv);
    const sheet = buildDealSheet(input);
    expect(sheet.metrics.cout_total_eur).toBe(2_440_000);
    // LTV = 1 460 000 / 2 520 000 ≈ 0,579.
    expect(sheet.metrics.ltv).toBeCloseTo(0.579, 3);
    expect(sheet.charts.g3_waterfall.steps.length).toBeGreaterThan(0);
    expect(Object.keys(sheet.charts)).toHaveLength(11);
  });
});

describe("readers jsonb tolérants", () => {
  it("readScenarios : merge partiel + défauts", () => {
    const s = readScenarios({ pessimiste: { delta_prix_revente_pct: -0.2, retard_mois: 6 } });
    expect(s.pessimiste).toEqual({ delta_prix_revente_pct: -0.2, retard_mois: 6 });
    expect(s.central).toEqual(DEFAULT_SCENARIOS.central);
    expect(s.optimiste).toEqual(DEFAULT_SCENARIOS.optimiste);
  });

  it("readScenarios : null → défauts complets", () => {
    expect(readScenarios(null)).toEqual(DEFAULT_SCENARIOS);
    expect(readScenarios("nope")).toEqual(DEFAULT_SCENARIOS);
  });

  it("readFees : override partiel", () => {
    const f = readFees({ carried_operateur_pct: 0.25 });
    expect(f.carried_operateur_pct).toBe(0.25);
    expect(f.hurdle_annuel).toBe(DEFAULT_FEES.hurdle_annuel);
  });

  it("readSeniorRate : jsonb absent → défaut", () => {
    expect(readSeniorRate(null)).toBe(DEFAULT_SENIOR_RATE);
    expect(readSeniorRate({ taux_dette_senior_annuel: 0.06 })).toBe(0.06);
  });
});
