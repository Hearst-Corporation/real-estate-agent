import { describe, it, expect } from "vitest";
import { parseManualAdjustments, emptyContinuity, DECISIONS } from "./continuity";

describe("parseManualAdjustments", () => {
  it("retourne [] sur une entrée non-tableau", () => {
    expect(parseManualAdjustments(null)).toEqual([]);
    expect(parseManualAdjustments(undefined)).toEqual([]);
    expect(parseManualAdjustments({})).toEqual([]);
    expect(parseManualAdjustments("x")).toEqual([]);
  });

  it("ignore les items sans label", () => {
    const out = parseManualAdjustments([
      { pct: -5, raison: "sans label" },
      { label: "", raison: "label vide" },
    ]);
    expect(out).toHaveLength(0);
  });

  it("normalise un ajustement pct valide et complète les champs manquants", () => {
    const out = parseManualAdjustments([
      { label: "Négociation", pct: -3, raison: "marge de vente" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Négociation");
    expect(out[0].pct).toBe(-3);
    expect(out[0].eur).toBeNull();
    expect(typeof out[0].id).toBe("string");
    expect(out[0].id.length).toBeGreaterThan(0);
    expect(typeof out[0].date).toBe("string");
  });

  it("conserve l'id, l'auteur et la date fournis", () => {
    const out = parseManualAdjustments([
      {
        id: "fixed-id",
        label: "Toiture",
        eur: -15000,
        raison: "travaux",
        auteur: "agent@demo-x.local",
        date: "2026-07-17T10:00:00.000Z",
      },
    ]);
    expect(out[0].id).toBe("fixed-id");
    expect(out[0].eur).toBe(-15000);
    expect(out[0].pct).toBeNull();
    expect(out[0].auteur).toBe("agent@demo-x.local");
    expect(out[0].date).toBe("2026-07-17T10:00:00.000Z");
  });

  it("rejette les nombres non finis (pct/eur → null)", () => {
    const out = parseManualAdjustments([
      { label: "X", pct: Number.NaN, eur: Number.POSITIVE_INFINITY, raison: "r" },
    ]);
    expect(out[0].pct).toBeNull();
    expect(out[0].eur).toBeNull();
  });
});

describe("emptyContinuity", () => {
  it("fournit un état neutre exploitable par l'UI", () => {
    const c = emptyContinuity();
    expect(c.owner).toBeNull();
    expect(c.mandate).toBeNull();
    expect(c.decision).toBeNull();
    expect(c.manualAdjustments).toEqual([]);
  });
});

describe("DECISIONS", () => {
  it("expose exactement les 5 statuts de décision (miroir CHECK 0043)", () => {
    expect([...DECISIONS]).toEqual([
      "en_attente",
      "a_relancer",
      "mandat_signe",
      "refuse",
      "perdu",
    ]);
  });
});
