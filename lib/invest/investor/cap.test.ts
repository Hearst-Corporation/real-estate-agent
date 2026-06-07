/**
 * lib/invest/investor/cap.test.ts — ① calcul de plafond + classification (PUR).
 */

import { describe, it, expect } from "vitest";
import {
  computeInvestmentCap,
  classifyFromAssessment,
  toInvestorClass,
  RETAIL_CAP_FLOOR_CENTS,
} from "./index";

describe("computeInvestmentCap — non-averti", () => {
  it("applique le plancher 1000€ (100000c) sans capacité de perte", () => {
    const r = computeInvestmentCap({ investorClass: "non_sophisticated" });
    expect(r.isCapped).toBe(true);
    expect(r.capEur).toBe(RETAIL_CAP_FLOOR_CENTS);
    expect(r.capEur).toBe(100_000);
  });

  it("applique le plancher si 5% du patrimoine est inférieur", () => {
    // patrimoine net = 1_000_000c ; 5% = 50_000c < plancher 100_000c
    const r = computeInvestmentCap({
      investorClass: "non_sophisticated",
      lossCapacity: { annualIncomeEur: 1_000_000, liquidAssetsEur: 0, financialCommitmentsEur: 0 },
    });
    expect(r.capEur).toBe(100_000);
  });

  it("applique 5% du patrimoine net quand supérieur au plancher", () => {
    // patrimoine net = 10_000_000c ; 5% = 500_000c > plancher
    const r = computeInvestmentCap({
      investorClass: "non_sophisticated",
      lossCapacity: { annualIncomeEur: 6_000_000, liquidAssetsEur: 5_000_000, financialCommitmentsEur: 1_000_000 },
    });
    expect(r.capEur).toBe(500_000);
  });

  it("plancher au patrimoine net négatif (engagements > actifs)", () => {
    const r = computeInvestmentCap({
      investorClass: "non_sophisticated",
      lossCapacity: { annualIncomeEur: 0, liquidAssetsEur: 0, financialCommitmentsEur: 9_000_000 },
    });
    expect(r.capEur).toBe(100_000);
  });
});

describe("computeInvestmentCap — averti / professionnel", () => {
  it("aucun plafond pour sophisticated", () => {
    const r = computeInvestmentCap({ investorClass: "sophisticated" });
    expect(r.isCapped).toBe(false);
    expect(r.capEur).toBeNull();
  });

  it("aucun plafond pour professional", () => {
    const r = computeInvestmentCap({ investorClass: "professional" });
    expect(r.capEur).toBeNull();
  });
});

describe("classifyFromAssessment", () => {
  it("sophisticated si test réussi ET déclaration", () => {
    expect(classifyFromAssessment({ knowledgePassed: true, declaresSophisticated: true })).toBe("sophisticated");
  });
  it("retail si test échoué", () => {
    expect(classifyFromAssessment({ knowledgePassed: false, declaresSophisticated: true })).toBe("retail");
  });
  it("retail si pas de déclaration", () => {
    expect(classifyFromAssessment({ knowledgePassed: true, declaresSophisticated: false })).toBe("retail");
  });
  it("mappe vers la classe de profil", () => {
    expect(toInvestorClass("sophisticated")).toBe("sophisticated");
    expect(toInvestorClass("retail")).toBe("non_sophisticated");
  });
});
