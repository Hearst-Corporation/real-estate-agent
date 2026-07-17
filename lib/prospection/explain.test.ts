import { describe, it, expect } from "vitest";
import { buildExplanation } from "./explain";

describe("buildExplanation", () => {
  it("classe les facteurs du breakdown persisté : positifs → satisfaits, ≤0 pénalité → bloquants", () => {
    const breakdown = {
      "Zone recherchée (Juan-les-Pins)": 25,
      "Budget dans la fourchette": 30,
      "Surface conforme": 20,
      "Pénalité données manquantes": -10,
    };
    const exp = buildExplanation(breakdown, { zone_ok: true, budget_ok: true, surface_ok: true }, 65);
    expect(exp.satisfaits.map((f) => f.label)).toContain("Budget dans la fourchette");
    // Trié décroissant : budget (30) avant zone (25)
    expect(exp.satisfaits[0].points).toBe(30);
    expect(exp.bloquants.some((b) => b.label.includes("Pénalité"))).toBe(true);
    expect(exp.scorePlafonne).toBe(true);
  });

  it("un facteur à 0 point = critère imparfait (demandé mais non couvert)", () => {
    const exp = buildExplanation({ Zone: 25, Terrasse: 0 }, null, 25);
    expect(exp.imparfaits.some((f) => f.label === "Terrasse")).toBe(true);
    expect(exp.satisfaits.some((f) => f.label === "Zone")).toBe(true);
  });

  it("un flag de conformité à false ajoute un critère imparfait s'il n'est pas déjà couvert", () => {
    const exp = buildExplanation({ Zone: 25 }, { surface_ok: false }, 25);
    expect(exp.imparfaits.some((f) => f.label === "surface")).toBe(true);
  });

  it("n'invente rien sur un breakdown vide", () => {
    const exp = buildExplanation({}, {}, 0);
    expect(exp.satisfaits).toHaveLength(0);
    expect(exp.imparfaits).toHaveLength(0);
    expect(exp.bloquants).toHaveLength(0);
    expect(exp.scorePlafonne).toBe(false);
  });

  it("ne duplique pas un flag false déjà présent comme facteur", () => {
    // Le breakdown contient déjà « Surface … » → le flag surface_ok:false ne doit
    // pas rajouter un doublon « surface ».
    const exp = buildExplanation({ "Surface conforme": 0 }, { surface_ok: false }, 40);
    const surfaceCount = exp.imparfaits.filter((f) => f.label.toLowerCase().includes("surface")).length;
    expect(surfaceCount).toBe(1);
  });
});
