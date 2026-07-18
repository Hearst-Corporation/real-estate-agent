import { describe, it, expect } from "vitest";
import { recomputeMatchesForProperty } from "./recompute";
import type { Gpu1Client } from "@/lib/gpu1";

/**
 * Fake client PostgREST minimal : renvoie des réponses scriptées par table.
 * On vérifie que le recalcul DÉLÈGUE au moteur existant (score réel) et dégrade
 * honnêtement (unavailable / not_found) — pas de score fabriqué.
 */
function fakeSb(responses: {
  property?: { data: unknown; error?: { code: string } | null };
  criteres?: { data: unknown; error?: { code: string } | null };
}): Gpu1Client {
  function builder(table: string) {
    const isProp = table === "properties";
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.limit = () =>
      Promise.resolve(responses.criteres ?? { data: [], error: null });
    chain.maybeSingle = () =>
      Promise.resolve(
        isProp
          ? responses.property ?? { data: null, error: null }
          : { data: null, error: null },
      );
    return chain;
  }
  return { from: (t: string) => builder(t) } as unknown as Gpu1Client;
}

const PROPERTY = {
  id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "real-estate-agent",
  property_type: "appartement",
  title: "T3 Antibes",
  notes: null,
  asking_price: 300000,
  surface: 70,
  rooms: 3,
  bedrooms: 2,
  postal_code: "06600",
  city: "Antibes",
  has_elevator: true,
  has_terrace: true,
  has_parking: false,
  has_garden: false,
  has_pool: false,
  dpe_letter: "C",
};

const CRITERE = {
  id: "22222222-2222-2222-2222-222222222222",
  tenant_id: "real-estate-agent",
  user_id: "33333333-3333-3333-3333-333333333333",
  lead_id: "44444444-4444-4444-4444-444444444444",
  nom: "Famille Martin",
  type_bien: ["appartement"],
  budget_min: 250000,
  budget_max: 350000,
  surface_min: 60,
  pieces_min: 3,
  zones: ["06600"],
  terrasse: "indifferent",
  parking: "indifferent",
  ascenseur: "indifferent",
  jardin: "indifferent",
  piscine: "indifferent",
  actif: true,
};

const U = "33333333-3333-3333-3333-333333333333";
const T = "real-estate-agent";

describe("recomputeMatchesForProperty", () => {
  it("délègue au moteur existant et renvoie un score RÉEL (pas fabriqué)", async () => {
    const sb = fakeSb({
      property: { data: PROPERTY, error: null },
      criteres: { data: [CRITERE], error: null },
    });
    const res = await recomputeMatchesForProperty(sb, PROPERTY.id, U, T);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.matches).toHaveLength(1);
    const m = res.matches[0];
    expect(m.critereNom).toBe("Famille Martin");
    // Le bien matche tous les critères durs → score élevé et high_priority.
    expect(m.score).toBeGreaterThanOrEqual(75);
    expect(m.recommandation).toBe("high_priority");
  });

  it("écarte un critère qui échoue à un filtre dur (budget dépassé) sans score inventé", async () => {
    const sb = fakeSb({
      property: { data: PROPERTY, error: null },
      criteres: { data: [{ ...CRITERE, budget_max: 200000 }], error: null },
    });
    const res = await recomputeMatchesForProperty(sb, PROPERTY.id, U, T);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.matches).toHaveLength(0);
  });

  it("bien introuvable → not_found", async () => {
    const sb = fakeSb({ property: { data: null, error: null } });
    const res = await recomputeMatchesForProperty(sb, PROPERTY.id, U, T);
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("table absente → unavailable honnête", async () => {
    const sb = fakeSb({ property: { data: null, error: { code: "42P01" } } });
    const res = await recomputeMatchesForProperty(sb, PROPERTY.id, U, T);
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });
});
