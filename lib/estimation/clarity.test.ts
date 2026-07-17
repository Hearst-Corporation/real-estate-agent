import { describe, it, expect } from "vitest";
import { computeValueClarity, MATERIAL_FIELDS } from "./clarity";
import type { PropertyData, FieldStatusMap } from "./types";

const P = (o: Partial<PropertyData> = {}): PropertyData => o as PropertyData;

describe("computeValueClarity", () => {
  it("classe tous les champs matériels comme manquants sur une fiche vide", () => {
    const { missing, toVerify } = computeValueClarity(P(), {});
    expect(missing).toHaveLength(MATERIAL_FIELDS.length);
    expect(toVerify).toHaveLength(0);
  });

  it("retire un champ de « manquant » dès qu'il est renseigné", () => {
    const { missing } = computeValueClarity(
      P({ surface_habitable_m2: 80, type_bien: "appartement" }),
      {}
    );
    const fields = missing.map((m) => m.field);
    expect(fields).not.toContain("surface_habitable_m2");
    expect(fields).not.toContain("type_bien");
  });

  it("classe « à vérifier » un champ rempli mais marqué to_confirm", () => {
    const fs: FieldStatusMap = { surface_habitable_m2: "to_confirm" };
    const { missing, toVerify } = computeValueClarity(
      P({ surface_habitable_m2: 80 }),
      fs
    );
    expect(toVerify.map((f) => f.field)).toContain("surface_habitable_m2");
    // rempli → n'est plus manquant
    expect(missing.map((f) => f.field)).not.toContain("surface_habitable_m2");
  });

  it("un champ vide marqué to_confirm reste « manquant » (vide prime)", () => {
    const fs: FieldStatusMap = { etat_general: "to_confirm" };
    const { missing, toVerify } = computeValueClarity(P(), fs);
    expect(missing.map((f) => f.field)).toContain("etat_general");
    expect(toVerify.map((f) => f.field)).not.toContain("etat_general");
  });

  it("traite une chaîne blanche comme manquante", () => {
    const { missing } = computeValueClarity(P({ exposition: "   " as never }), {});
    expect(missing.map((f) => f.field)).toContain("exposition");
  });
});
