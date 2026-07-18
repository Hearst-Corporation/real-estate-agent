import { describe, it, expect } from "vitest";
import { propertyToAnnonce, matchPropertyToAcquereurs, type PropertyRow } from "./matching";

function property(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "real-estate-agent",
    user_id: "22222222-2222-2222-2222-222222222222",
    lead_id: null,
    address: null,
    asking_price: 300_000,
    bedrooms: 2,
    cellar: false,
    charges_monthly: null,
    city: "Antibes",
    created_at: "2026-01-01T00:00:00Z",
    dpe_letter: "C",
    estimated_value: null,
    estimation_id: null,
    floor: null,
    floor_total: null,
    ges_letter: null,
    has_elevator: true,
    has_garden: false,
    has_parking: true,
    has_pool: false,
    has_terrace: true,
    notes: null,
    orientation: null,
    parking_count: 1,
    postal_code: "06600",
    property_type: "appartement",
    rooms: 3,
    status: "active",
    surface: 70,
    taxe_fonciere: null,
    title: "T3 vue mer",
    updated_at: "2026-01-01T00:00:00Z",
    year_built: null,
    ...overrides,
  } as unknown as PropertyRow;
}

// Ligne brute prosp_criteres_acquereur (comme renvoyée par PostgREST).
function critereRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    tenant_id: "real-estate-agent",
    user_id: "22222222-2222-2222-2222-222222222222",
    lead_id: "44444444-4444-4444-4444-444444444444",
    nom: "Famille Durand",
    type_bien: ["appartement"],
    budget_min: 250_000,
    budget_max: 350_000,
    surface_min: 60,
    surface_max: 90,
    pieces_min: 3,
    pieces_max: 4,
    zones: ["06600"],
    terrasse: "indifferent",
    parking: "indifferent",
    ascenseur: "indifferent",
    jardin: "indifferent",
    piscine: "indifferent",
    dpe_max: "D",
    alerte_email: true,
    alerte_whatsapp: false,
    telephone: null,
    actif: true,
    ...overrides,
  };
}

describe("propertyToAnnonce", () => {
  it("mappe les champs properties → Annonce sans inventer de valeur", () => {
    const a = propertyToAnnonce(property({ asking_price: null, surface: null }));
    expect(a.source).toBe("portfolio");
    expect(a.typeBien).toBe("appartement");
    expect(a.codePostal).toBe("06600");
    expect(a.prix).toBeUndefined(); // absent → undefined, jamais 0 fabriqué
    expect(a.surface).toBeUndefined();
    expect(a.terrasse).toBe(true);
  });
});

describe("matchPropertyToAcquereurs", () => {
  it("retourne un acquéreur matché avec un score réel du moteur prospection", () => {
    const matches = matchPropertyToAcquereurs(property(), [critereRow()]);
    expect(matches).toHaveLength(1);
    expect(matches[0].critereNom).toBe("Famille Durand");
    // Tout aligné (zone+budget+surface+pièces+type) → score plein 100.
    expect(matches[0].score).toBe(100);
    expect(matches[0].recommandation).toBe("high_priority");
    expect(matches[0].leadId).toBe("44444444-4444-4444-4444-444444444444");
  });

  it("écarte un critère qui échoue à un filtre dur (budget dépassé) — pas de score inventé", () => {
    const matches = matchPropertyToAcquereurs(property({ asking_price: 500_000 }), [
      critereRow(), // budget_max 350k
    ]);
    expect(matches).toHaveLength(0);
  });

  it("écarte un critère hors zone", () => {
    const matches = matchPropertyToAcquereurs(property(), [critereRow({ zones: ["75001"] })]);
    expect(matches).toHaveLength(0);
  });

  it("plafonne le score quand une donnée essentielle manque (pas de high à l'aveugle)", () => {
    const matches = matchPropertyToAcquereurs(property({ asking_price: null }), [
      critereRow({ budget_min: null, budget_max: null }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBeLessThanOrEqual(60); // MISSING_ESSENTIAL_SCORE_CAP
  });

  it("trie par score décroissant", () => {
    const rows = [
      critereRow({ id: "aaaa1111-1111-1111-1111-111111111111", nom: "Bas", surface_min: 200 }),
      critereRow({ id: "bbbb2222-2222-2222-2222-222222222222", nom: "Haut" }),
    ];
    // Le premier a surface_min 200 (>70) → surface hors range → score plus bas
    // mais reste un match (filtre surface est souple, pas dur ici → scoreSurface 0).
    const matches = matchPropertyToAcquereurs(property(), rows);
    // Les deux matchent (zone/budget/type OK), triés desc.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });
});
