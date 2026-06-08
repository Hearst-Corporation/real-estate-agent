import { describe, it, expect } from "vitest";
import { zoneMatches, matchAnnonce } from "./match";
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
