import { describe, it, expect } from "vitest";
import { criteriaMetFromBreakdown } from "./aggregate";

// criteriaMetFromBreakdown est PUR (pas d'I/O) → testable sans DB.
// Il dérive la conformité par critère du breakdown réel persisté, en réutilisant
// les poids du moteur (MATCH_WEIGHTS) comme SOURCE UNIQUE.

describe("criteriaMetFromBreakdown — dérivation conformité depuis le breakdown réel", () => {
  it("critère au poids plein → satisfait (true)", () => {
    const met = criteriaMetFromBreakdown({ zone: 40, budget: 20, surface: 15, pieces: 10, typeBien: 10 });
    expect(met.zone).toBe(true);
    expect(met.budget).toBe(true);
    expect(met.surface).toBe(true);
    expect(met.pieces).toBe(true);
    expect(met.typeBien).toBe(true);
  });

  it("critère en demi-score (donnée manquante) → non satisfait (false)", () => {
    // budget à 10 alors que le poids plein = 20 → non conforme.
    const met = criteriaMetFromBreakdown({ zone: 40, budget: 10, surface: 7.5 });
    expect(met.budget).toBe(false);
    expect(met.surface).toBe(false);
  });

  it("critère à 0 point → non satisfait (false)", () => {
    const met = criteriaMetFromBreakdown({ zone: 40, budget: 0 });
    expect(met.budget).toBe(false);
  });

  it("critère absent du breakdown → null (non évaluable)", () => {
    const met = criteriaMetFromBreakdown({ zone: 40 });
    expect(met.budget).toBeNull();
    expect(met.pieces).toBeNull();
  });

  it("breakdown null/vide → tous null", () => {
    const met = criteriaMetFromBreakdown(null);
    expect(met.zone).toBeNull();
    expect(met.confort).toBeNull();
  });

  it("confort à 0 (aucun bonus) → non satisfait", () => {
    const met = criteriaMetFromBreakdown({ zone: 40, confort: 0 });
    expect(met.confort).toBe(false);
  });
});
