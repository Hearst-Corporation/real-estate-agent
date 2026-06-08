import { describe, it, expect } from "vitest";
import { isSeedLabel, filterSeed } from "./demo-filter";

describe("isSeedLabel", () => {
  it("détecte les motifs de seed/test", () => {
    expect(isSeedLabel("TEST-DEEP-BIEN")).toBe(true);
    expect(isSeedLabel("[SEED] Appartement Haussmannien")).toBe(true);
    expect(isSeedLabel("TEST-BIEN-SELLER")).toBe(true);
    expect(isSeedLabel("TestCity")).toBe(true);
    expect(isSeedLabel("Nouveau lead")).toBe(true);
  });

  it("laisse passer les vrais libellés métier", () => {
    expect(isSeedLabel("Appartement T4 Lyon 6e")).toBe(false);
    expect(isSeedLabel("Marie Martin")).toBe(false);
    expect(isSeedLabel("Antibes")).toBe(false);
    expect(isSeedLabel(null)).toBe(false);
    expect(isSeedLabel("")).toBe(false);
  });

  it("ne confond pas un nom contenant 'test' au milieu", () => {
    // 'TEST-' est ancré sur un mot ; 'Contestation' ne matche pas.
    expect(isSeedLabel("Contestation immobilière")).toBe(false);
  });
});

describe("filterSeed", () => {
  type Row = { name: string | null; city?: string | null };
  const rows: Row[] = [
    { name: "Marie Martin" },
    { name: "TEST-CHAIN-1" },
    { name: "[SEED] Thomas Bertrand" },
    { name: "Sophie Chen", city: "TestCity" }, // seed via la ville
    { name: "Pierre Durand", city: "Lyon" },
  ];

  it("retire les lignes dont un champ-libellé est un seed (masquage actif)", () => {
    const kept = filterSeed(rows, (r) => [r.name, r.city]);
    expect(kept.map((r) => r.name)).toEqual(["Marie Martin", "Pierre Durand"]);
  });

  it("respecte HIDE_SEED_DATA=false (no-op)", () => {
    const prev = process.env.HIDE_SEED_DATA;
    process.env.HIDE_SEED_DATA = "false";
    try {
      expect(filterSeed(rows, (r) => [r.name, r.city])).toHaveLength(5);
    } finally {
      if (prev === undefined) delete process.env.HIDE_SEED_DATA;
      else process.env.HIDE_SEED_DATA = prev;
    }
  });
});
