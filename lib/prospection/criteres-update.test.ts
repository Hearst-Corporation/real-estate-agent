/**
 * Tests de la logique PARTAGÉE de mise à jour des préférences acquéreur
 * (lib/prospection/criteres-update.ts), consommée à l'identique par la route
 * produit PATCH /api/prospection/criteres ET l'interface gateway
 * `buyers.update_preferences`. Garantit qu'il n'existe qu'UNE règle (pas de
 * copie divergente) : delta partiel, pas d'écrasement, normalisation type_bien,
 * bornes croisées, enums miroir des CHECK DB 0043.
 */
import { describe, it, expect } from "vitest";
import {
  buildCriterePatch,
  UpdateCritereSchema,
  CriterePreferencesFields,
  CRITERE_PREFERENCE_KEYS,
} from "./criteres-update";

describe("buildCriterePatch — delta partiel", () => {
  it("ne pousse QUE les champs fournis (les absents sont ignorés)", () => {
    const patch = buildCriterePatch({ budget_max: 500000, urgence: "haute" });
    expect(patch).toEqual({ budget_max: 500000, urgence: "haute" });
    expect(Object.keys(patch)).not.toContain("budget_min");
  });

  it("un champ explicitement null EST poussé (remise à zéro voulue)", () => {
    const patch = buildCriterePatch({ dpe_max: null });
    expect(patch).toEqual({ dpe_max: null });
  });

  it("un champ undefined n'est PAS poussé (pas d'écrasement implicite)", () => {
    const patch = buildCriterePatch({ budget_max: undefined, parking: "requis" });
    expect(patch).toEqual({ parking: "requis" });
  });

  it("type_bien string → tableau, null → null, tableau → tel quel", () => {
    expect(buildCriterePatch({ type_bien: "maison" }).type_bien).toEqual(["maison"]);
    expect(buildCriterePatch({ type_bien: null }).type_bien).toBeNull();
    expect(buildCriterePatch({ type_bien: ["a", "b"] }).type_bien).toEqual(["a", "b"]);
  });

  it("ignore les clés non-préférence (id/buyer_id/tenant_id jamais écrites)", () => {
    const patch = buildCriterePatch({
      id: "x",
      buyer_id: "y",
      tenant_id: "t",
      actor_user_id: "u",
      agent_id: "a",
      budget_max: 1,
    });
    expect(patch).toEqual({ budget_max: 1 });
  });

  it("delta vide → patch vide (l'appelant décide de refuser)", () => {
    expect(buildCriterePatch({})).toEqual({});
  });
});

describe("UpdateCritereSchema — bornes + enums (miroir CHECK 0043)", () => {
  const ID = "66666666-6666-4666-8666-666666666666";

  it("accepte un delta partiel valide avec id", () => {
    const r = UpdateCritereSchema.safeParse({ id: ID, budget_max: 500000, urgence: "haute" });
    expect(r.success).toBe(true);
  });

  it("refuse budget_min > budget_max", () => {
    const r = UpdateCritereSchema.safeParse({ id: ID, budget_min: 900000, budget_max: 100000 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("budget_range_invalid");
  });

  it("refuse un enum hors CHECK (urgence)", () => {
    const r = UpdateCritereSchema.safeParse({ id: ID, urgence: "catastrophique" });
    expect(r.success).toBe(false);
  });

  it("refuse un champ inconnu (.strict)", () => {
    const r = UpdateCritereSchema.safeParse({ id: ID, unknown_field: 1 });
    expect(r.success).toBe(false);
  });

  it("normalise une zone texte libre en objet { label }", () => {
    const r = UpdateCritereSchema.safeParse({ id: ID, zones: ["Nice, 06000"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zones).toEqual([{ label: "Nice, 06000" }]);
  });
});

describe("cohérence des surfaces (parité route ↔ gateway)", () => {
  it("les clés de préférence exportées couvrent bien les champs éditables", () => {
    // Toute clé de CriterePreferencesFields est reconnue par buildCriterePatch.
    for (const k of Object.keys(CriterePreferencesFields)) {
      expect(CRITERE_PREFERENCE_KEYS).toContain(k);
    }
    // Et réciproquement, buildCriterePatch ne connaît QUE ces clés.
    expect(CRITERE_PREFERENCE_KEYS.sort()).toEqual(Object.keys(CriterePreferencesFields).sort());
  });
});
