import { describe, it, expect } from "vitest";
import { deriveLearningProfile, deriveCriterionSignal, MIN_EVIDENCE } from "./signals";
import type { FeedbackEvent } from "./types";

/** Fabrique un évènement positif où `criterion` était satisfait/non satisfait. */
function evt(
  polarity: FeedbackEvent["polarity"],
  criteriaMet: FeedbackEvent["criteriaMet"],
): FeedbackEvent {
  return { source: "prosp_match", polarity, criteriaMet };
}

describe("deriveCriterionSignal — classement satisfait / toléré / bloquant", () => {
  it("classe SATISFAIT un critère validé plusieurs fois quand il était conforme", () => {
    const events = [
      evt("positive", { budget: true }),
      evt("positive", { budget: true }),
      evt("positive", { budget: true }),
    ];
    const s = deriveCriterionSignal(events, "budget");
    expect(s.status).toBe("satisfait");
    expect(s.evidence.positiveMet).toBe(3);
    expect(s.weightFactor).toBeGreaterThan(1);
    expect(s.reason).toMatch(/confirmé/i);
  });

  it("classe TOLÉRÉ un critère validé alors qu'il n'était PAS satisfait (ex. +10% budget)", () => {
    const events = [
      evt("positive", { budget: false }),
      evt("positive", { budget: false }),
    ];
    const s = deriveCriterionSignal(events, "budget");
    expect(s.status).toBe("tolere");
    expect(s.evidence.positiveUnmet).toBe(2);
    expect(s.weightFactor).toBeLessThan(1);
    expect(s.reason).toMatch(/tolère/i);
  });

  it("classe BLOQUANT un critère refusé systématiquement quand il manquait (ex. refuse RDC)", () => {
    const events = [
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
    ];
    const s = deriveCriterionSignal(events, "zone");
    expect(s.status).toBe("bloquant");
    expect(s.evidence.negativeUnmet).toBe(3);
    expect(s.weightFactor).toBeGreaterThan(1);
    expect(s.reason).toMatch(/bloquant/i);
  });

  it("classe INSUFFICIENT_DATA sous le seuil de preuve (1 seul feedback)", () => {
    const events = [evt("positive", { surface: true })];
    const s = deriveCriterionSignal(events, "surface");
    expect(s.status).toBe("insufficient_data");
    expect(s.weightFactor).toBe(1);
  });

  it("ignore les évènements où le critère n'était pas évaluable (null/absent)", () => {
    const events = [
      evt("positive", { budget: null }),
      evt("positive", {}), // pieces absent
    ];
    const s = deriveCriterionSignal(events, "pieces");
    expect(s.evidence.evaluated).toBe(0);
    expect(s.status).toBe("insufficient_data");
  });

  it("le blocage l'emporte quand les refus sur absence dominent les tolérances", () => {
    const events = [
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
      evt("positive", { zone: false }),
    ];
    const s = deriveCriterionSignal(events, "zone");
    expect(s.status).toBe("bloquant");
  });

  it("un feedback neutre (a_revoir) est compté mais ne tranche pas", () => {
    const events = [
      evt("neutral", { budget: false }),
      evt("neutral", { budget: false }),
    ];
    const s = deriveCriterionSignal(events, "budget");
    expect(s.evidence.evaluated).toBe(2);
    expect(s.status).toBe("insufficient_data");
  });

  it("MIN_EVIDENCE vaut au moins 2 (jamais de conclusion sur 1 point)", () => {
    expect(MIN_EVIDENCE).toBeGreaterThanOrEqual(2);
  });
});

describe("deriveLearningProfile — profil complet", () => {
  it("sans feedback → insufficientData=true, tous les critères en insufficient_data", () => {
    const p = deriveLearningProfile("crit-1", []);
    expect(p.insufficientData).toBe(true);
    expect(p.totalFeedback).toBe(0);
    expect(p.signals.every((s) => s.status === "insufficient_data")).toBe(true);
    expect(p.signals.every((s) => s.weightFactor === 1)).toBe(true);
  });

  it("mixe plusieurs critères : satisfait + toléré + bloquant sur le même prospect", () => {
    const events: FeedbackEvent[] = [
      // budget toléré (validé alors que non conforme)
      evt("positive", { budget: false, zone: true, surface: true }),
      evt("positive", { budget: false, zone: true, surface: true }),
      // zone satisfaite (validée + conforme, ≥2)
      // surface satisfaite (validée + conforme, ≥2)
    ];
    const p = deriveLearningProfile("crit-2", events);
    const byCrit = Object.fromEntries(p.signals.map((s) => [s.criterion, s.status]));
    expect(byCrit.budget).toBe("tolere");
    expect(byCrit.zone).toBe("satisfait");
    expect(byCrit.surface).toBe("satisfait");
    expect(p.insufficientData).toBe(false);
  });

  it("est déterministe : mêmes entrées → mêmes sorties", () => {
    const events: FeedbackEvent[] = [
      evt("positive", { budget: true }),
      evt("positive", { budget: true }),
    ];
    const a = deriveLearningProfile("crit-3", events);
    const b = deriveLearningProfile("crit-3", events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
