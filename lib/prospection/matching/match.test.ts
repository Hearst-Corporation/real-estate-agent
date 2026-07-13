import { describe, it, expect } from "vitest";
import { zoneMatches, matchAnnonce, computeValuationComparison } from "./match";
import type { EstimationInput } from "./match";
import { MATCH_ENGINE_VERSION } from "./weights";
import type { Annonce, CritereAcquereur } from "../types";

const annonce = (over: Partial<Annonce>): Annonce => ({
  id: "a1",
  tenantId: "real-estate-agent",
  source: "apify_lbc",
  sourceId: "lbc-1",
  hashDedup: "h1",
  typeBien: "appartement",
  prix: 300000,
  surface: 60,
  pieces: 3,
  codePostal: "",
  ville: "Antibes",
  isPap: false,
  ...over,
});

const critere = (over: Partial<CritereAcquereur>): CritereAcquereur => ({
  id: "c1",
  tenantId: "real-estate-agent",
  userId: "u1",
  nom: "Test",
  zones: ["Antibes"],
  typeBien: ["appartement"],
  budgetMin: 200000,
  budgetMax: 400000,
  terrasse: "indifferent",
  parking: "indifferent",
  ascenseur: "indifferent",
  jardin: "indifferent",
  piscine: "indifferent",
  alerteEmail: false,
  alerteWhatsapp: false,
  actif: true,
  ...over,
});

describe("zoneMatches", () => {
  it("matche par commune quand le code postal est vide (cas Apify par ville)", () => {
    expect(zoneMatches("Antibes", annonce({ codePostal: "", ville: "Antibes" }))).toBe(true);
  });

  it("matche par préfixe de code postal (cas MoteurImmo par CP)", () => {
    expect(zoneMatches("066", annonce({ codePostal: "06600", ville: "" }))).toBe(true);
    expect(zoneMatches("06600", annonce({ codePostal: "06600", ville: "" }))).toBe(true);
  });

  it("insensible à la casse et aux espaces sur la commune", () => {
    expect(zoneMatches(" antibes ", annonce({ codePostal: "", ville: "ANTIBES" }))).toBe(true);
  });

  it("ne matche pas une autre commune / un autre CP", () => {
    expect(zoneMatches("Cannes", annonce({ codePostal: "", ville: "Antibes" }))).toBe(false);
    expect(zoneMatches("75011", annonce({ codePostal: "06600", ville: "Antibes" }))).toBe(false);
  });

  it("zone vide → jamais", () => {
    expect(zoneMatches("", annonce({ ville: "Antibes" }))).toBe(false);
  });
});

describe("matchAnnonce — régression zone Apify (CP vide)", () => {
  it("matche une annonce Antibes (CP vide) contre un critère zones=['Antibes']", () => {
    const res = matchAnnonce(critere({}), annonce({ codePostal: "", ville: "Antibes", prix: 300000 }));
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThanOrEqual(50);
    expect(res!.breakdown.zone).toBeGreaterThan(0);
  });

  it("rejette hors budget même si la zone matche", () => {
    const res = matchAnnonce(critere({ budgetMax: 250000 }), annonce({ prix: 300000 }));
    expect(res).toBeNull();
  });
});

describe("matchAnnonce — versionnement du moteur", () => {
  it("expose engineVersion sur chaque résultat", () => {
    const res = matchAnnonce(critere({}), annonce({}));
    expect(res).not.toBeNull();
    expect(res!.engineVersion).toBe(MATCH_ENGINE_VERSION);
    expect(res!.engineVersion).toMatch(/^match@\d+\.\d+\.\d+$/);
  });
});

describe("matchAnnonce — recommandation", () => {
  it("high_priority quand tous les critères sont satisfaits (score ≥ 75)", () => {
    // zone 40 + budget 20 + surface 15 + pièces 10 + typeBien 10 = 95
    const res = matchAnnonce(critere({}), annonce({ prix: 300000, surface: 60, pieces: 3 }));
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThanOrEqual(75);
    expect(res!.recommandation).toBe("high_priority");
  });

  it("review quand le score est entre 50 et 74", () => {
    // surface + pièces absentes → demi-scores, mais score plafonné à 60 (données
    // manquantes) : zone 40 + budget 20 + typeBien 10 + demi-surface/pièces → cap 60 → review
    const res = matchAnnonce(
      critere({}),
      annonce({ prix: 300000, surface: undefined, pieces: undefined }),
    );
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThanOrEqual(50);
    expect(res!.score).toBeLessThan(75);
    expect(res!.recommandation).toBe("review");
  });

  it("rejected (null) quand un must-have échoue", () => {
    // rejected = must-have KO → matchAnnonce retourne null
    const res = matchAnnonce(critere({ typeBien: ["maison"] }), annonce({ typeBien: "appartement" }));
    expect(res).toBeNull();
  });

  it("expose satisfaits / nonSatisfaits pour l'explicabilité UI", () => {
    // surface absente → demi-score < poids plein → classée nonSatisfaits
    const res = matchAnnonce(
      critere({}),
      annonce({ prix: 300000, surface: undefined, pieces: 3 }),
    );
    expect(res).not.toBeNull();
    expect(res!.explain.satisfaits).toContain("zone");
    expect(res!.explain.satisfaits).toContain("budget");
    expect(res!.explain.nonSatisfaits).toContain("surface");
    expect(res!.explain.bloquants).toEqual([]);
  });
});

describe("matchAnnonce — pénalité données manquantes", () => {
  it("une annonce sans prix ne peut PAS être high_priority", () => {
    const res = matchAnnonce(critere({}), annonce({ prix: undefined, surface: 60, pieces: 3 }));
    expect(res).not.toBeNull();
    expect(res!.explain.donneesManquantes).toContain("prix");
    expect(res!.explain.scorePlafonne).toBe(true);
    expect(res!.score).toBeLessThan(75);
    expect(res!.recommandation).not.toBe("high_priority");
  });

  it("une annonce complète n'est pas plafonnée", () => {
    const res = matchAnnonce(critere({}), annonce({ prix: 300000, surface: 60, pieces: 3 }));
    expect(res).not.toBeNull();
    expect(res!.explain.donneesManquantes).toEqual([]);
    expect(res!.explain.scorePlafonne).toBe(false);
  });

  it("le plafond ne fait jamais monter le score (pénalité ≤ 0)", () => {
    const res = matchAnnonce(critere({}), annonce({ prix: undefined, surface: undefined, pieces: undefined }));
    expect(res).not.toBeNull();
    expect(res!.breakdown.penaliteDonneesManquantes).toBeLessThanOrEqual(0);
  });
});

describe("computeValuationComparison — écart prix/estimation", () => {
  const estim = (over: Partial<EstimationInput>): EstimationInput => ({
    marketValue: 300000,
    lowValue: 285000,
    highValue: 315000,
    dataStatus: "complete",
    confidence: "elevee",
    ...over,
  });

  it("within_range quand le prix est dans la fourchette", () => {
    const cmp = computeValuationComparison(annonce({ prix: 300000 }), estim({}));
    expect(cmp.status).toBe("within_range");
    expect(cmp.gap).toBe(0);
  });

  it("below_range quand le prix est sous la fourchette basse", () => {
    const cmp = computeValuationComparison(annonce({ prix: 250000 }), estim({}));
    expect(cmp.status).toBe("below_range");
    expect(cmp.gap).toBeLessThan(0);
  });

  it("above_range quand le prix dépasse la fourchette haute", () => {
    const cmp = computeValuationComparison(annonce({ prix: 350000 }), estim({}));
    expect(cmp.status).toBe("above_range");
    expect(cmp.gap).toBeGreaterThan(0);
  });

  it("unavailable sans estimation", () => {
    const cmp = computeValuationComparison(annonce({ prix: 300000 }), null);
    expect(cmp.status).toBe("unavailable");
    expect(cmp.gap).toBeNull();
  });

  it("unavailable si le prix de l'annonce manque", () => {
    const cmp = computeValuationComparison(annonce({ prix: undefined }), estim({}));
    expect(cmp.status).toBe("unavailable");
    expect(cmp.gap).toBeNull();
  });

  it("low_confidence si l'estimation est dégradée / indicative", () => {
    const cmp = computeValuationComparison(annonce({ prix: 350000 }), estim({ dataStatus: "degraded" }));
    expect(cmp.status).toBe("low_confidence");
    expect(cmp.gap).toBeNull();
  });

  it("matchAnnonce embarque valuation=unavailable quand aucune estimation n'est fournie", () => {
    const res = matchAnnonce(critere({}), annonce({ prix: 300000 }));
    expect(res).not.toBeNull();
    expect(res!.valuation.status).toBe("unavailable");
  });

  it("matchAnnonce calcule le gap quand une estimation est fournie", () => {
    const res = matchAnnonce(critere({}), annonce({ prix: 330000, surface: 60, pieces: 3 }), estim({}));
    expect(res).not.toBeNull();
    expect(res!.valuation.status).toBe("above_range");
    expect(res!.valuation.gap).toBeCloseTo(0.1, 5);
  });
});

describe("matchAnnonce — déterminisme", () => {
  it("mêmes entrées → sortie identique (JSON stable)", () => {
    const c = critere({});
    const a = annonce({ prix: 300000, surface: 60, pieces: 3 });
    const e: EstimationInput = { marketValue: 300000, lowValue: 285000, highValue: 315000, dataStatus: "complete", confidence: "elevee" };
    const r1 = matchAnnonce(c, a, e);
    const r2 = matchAnnonce(c, a, e);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
