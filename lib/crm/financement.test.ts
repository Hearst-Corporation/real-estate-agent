import { describe, it, expect } from "vitest";
import {
  FinancementInputSchema,
  FinancementFieldSchema,
  normalizeFinancement,
  parseFinancement,
  hasFinancement,
  financementModeLabel,
  financementSummary,
  financementTone,
  FINANCEMENT_MONTANT_MAX,
} from "./financement";

describe("FinancementInputSchema (validation entrée)", () => {
  it("accepte un mode seul", () => {
    const r = FinancementInputSchema.safeParse({ mode: "comptant" });
    expect(r.success).toBe(true);
  });

  it("accepte un objet complet valide", () => {
    const r = FinancementInputSchema.safeParse({
      mode: "pret_a_obtenir",
      apport: 50000,
      montant_pret: 200000,
      organisme: "Crédit Agricole",
      notes: "Rendez-vous banque la semaine prochaine",
    });
    expect(r.success).toBe(true);
  });

  it("refuse un mode inconnu", () => {
    expect(FinancementInputSchema.safeParse({ mode: "loto" }).success).toBe(false);
  });

  it("refuse un objet sans mode", () => {
    expect(FinancementInputSchema.safeParse({ apport: 1000 }).success).toBe(false);
  });

  it("refuse un montant négatif", () => {
    expect(
      FinancementInputSchema.safeParse({ mode: "comptant", apport: -1 }).success,
    ).toBe(false);
  });

  it("refuse un montant au-delà du plafond", () => {
    expect(
      FinancementInputSchema.safeParse({
        mode: "comptant",
        apport: FINANCEMENT_MONTANT_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it("refuse un montant non entier", () => {
    expect(
      FinancementInputSchema.safeParse({ mode: "comptant", apport: 1000.5 }).success,
    ).toBe(false);
  });

  it("refuse une clé inconnue (strict)", () => {
    expect(
      FinancementInputSchema.safeParse({ mode: "comptant", hacked: true }).success,
    ).toBe(false);
  });

  it("refuse un texte trop long", () => {
    expect(
      FinancementInputSchema.safeParse({
        mode: "comptant",
        organisme: "x".repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe("FinancementFieldSchema (champ complet)", () => {
  it("accepte null (effacement explicite)", () => {
    expect(FinancementFieldSchema.safeParse(null).success).toBe(true);
  });

  it("accepte un objet valide", () => {
    expect(FinancementFieldSchema.safeParse({ mode: "en_reflexion" }).success).toBe(true);
  });

  it("refuse une string", () => {
    expect(FinancementFieldSchema.safeParse("comptant").success).toBe(false);
  });
});

describe("normalizeFinancement", () => {
  it("renvoie null pour null/undefined", () => {
    expect(normalizeFinancement(null)).toBeNull();
    expect(normalizeFinancement(undefined)).toBeNull();
  });

  it("comble les champs absents par null", () => {
    expect(normalizeFinancement({ mode: "comptant" })).toEqual({
      mode: "comptant",
      apport: null,
      montant_pret: null,
      organisme: null,
      notes: null,
    });
  });

  it("normalise les chaînes vides / espaces en null", () => {
    const out = normalizeFinancement({
      mode: "comptant",
      organisme: "   ",
      notes: "",
    });
    expect(out?.organisme).toBeNull();
    expect(out?.notes).toBeNull();
  });

  it("trim les textes conservés", () => {
    const out = normalizeFinancement({ mode: "comptant", organisme: "  BNP  " });
    expect(out?.organisme).toBe("BNP");
  });
});

describe("parseFinancement (jsonb DB non fiable)", () => {
  it("null pour valeurs non-objet", () => {
    expect(parseFinancement(null)).toBeNull();
    expect(parseFinancement(undefined)).toBeNull();
    expect(parseFinancement("comptant")).toBeNull();
    expect(parseFinancement(42)).toBeNull();
    expect(parseFinancement([])).toBeNull();
  });

  it("null si mode absent ou inconnu (donnée corrompue → non renseigné)", () => {
    expect(parseFinancement({})).toBeNull();
    expect(parseFinancement({ mode: "wat" })).toBeNull();
    expect(parseFinancement({ apport: 1000 })).toBeNull();
  });

  it("parse un objet valide et ignore les montants non numériques", () => {
    expect(
      parseFinancement({
        mode: "pret_en_cours",
        apport: "beaucoup",
        montant_pret: 180000,
        organisme: "  Boursorama  ",
        notes: "",
      }),
    ).toEqual({
      mode: "pret_en_cours",
      apport: null,
      montant_pret: 180000,
      organisme: "Boursorama",
      notes: null,
    });
  });

  it("ne jette jamais sur données hostiles", () => {
    expect(() => parseFinancement({ mode: { nested: true } })).not.toThrow();
    expect(parseFinancement({ mode: { nested: true } })).toBeNull();
  });
});

describe("hasFinancement", () => {
  it("true seulement si mode reconnu", () => {
    expect(hasFinancement({ mode: "comptant" })).toBe(true);
    expect(hasFinancement(null)).toBe(false);
    expect(hasFinancement({ apport: 1000 })).toBe(false);
  });
});

describe("financementModeLabel", () => {
  it("mappe les modes connus", () => {
    expect(financementModeLabel("accord_principe")).toBe("Accord de principe");
    expect(financementModeLabel("comptant")).toBe("Comptant");
  });
  it("fallback = valeur brute pour l'inconnu", () => {
    expect(financementModeLabel("mystere")).toBe("mystere");
  });
});

describe("financementSummary", () => {
  it("null si non renseigné", () => {
    expect(financementSummary(null)).toBeNull();
    expect(financementSummary({ mode: "bad" })).toBeNull();
  });

  it("mode seul si aucun montant", () => {
    expect(financementSummary({ mode: "en_reflexion" })).toBe("En réflexion");
  });

  it("comptant + apport", () => {
    const s = financementSummary({ mode: "comptant", apport: 150000 });
    expect(s).toContain("Comptant");
    expect(s).toMatch(/150/);
  });

  it("prêt affiché quand montant_pret présent", () => {
    const s = financementSummary({ mode: "pret_a_obtenir", montant_pret: 200000 });
    expect(s).toContain("Prêt à obtenir");
    expect(s).toMatch(/pr[êe]t/i);
  });
});

describe("financementTone (qualification)", () => {
  it("solide → lime", () => {
    expect(financementTone("comptant")).toBe("lime");
    expect(financementTone("accord_principe")).toBe("lime");
  });
  it("en cours → amber", () => {
    expect(financementTone("pret_en_cours")).toBe("amber");
    expect(financementTone("pret_a_obtenir")).toBe("amber");
  });
  it("non engagé → zinc", () => {
    expect(financementTone("en_reflexion")).toBe("zinc");
  });
});
