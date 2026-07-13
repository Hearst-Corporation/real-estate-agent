import { describe, it, expect } from "vitest";
import { normalizeScrapeParams, filterListings } from "./scrape-custom";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";

describe("normalizeScrapeParams", () => {
  it("exige une zone non vide", () => {
    expect(() => normalizeScrapeParams({})).toThrow("zone_required");
    expect(() => normalizeScrapeParams({ zone: "   " })).toThrow("zone_required");
    expect(() => normalizeScrapeParams(null)).toThrow("zone_required");
  });

  it("trim la zone et défaut typeBien=appartement", () => {
    const p = normalizeScrapeParams({ zone: "  Antibes  " });
    expect(p.zone).toBe("Antibes");
    expect(p.typeBien).toBe("appartement");
  });

  it("accepte typeBien=maison, tout le reste sinon → appartement", () => {
    expect(normalizeScrapeParams({ zone: "Cannes", typeBien: "maison" }).typeBien).toBe("maison");
    expect(normalizeScrapeParams({ zone: "Cannes", typeBien: "loft" }).typeBien).toBe("appartement");
  });

  it("borne les nombres (≥0, finis), null sinon", () => {
    const p = normalizeScrapeParams({
      zone: "Nice",
      budgetMin: "200000",
      budgetMax: 500000,
      surfaceMin: -5, // négatif → null
      surfaceMax: "abc", // NaN → null
      piecesMin: 3,
    });
    expect(p.budgetMin).toBe(200000);
    expect(p.budgetMax).toBe(500000);
    expect(p.surfaceMin).toBeNull();
    expect(p.surfaceMax).toBeNull();
    expect(p.piecesMin).toBe(3);
  });

  it("rejette budget_min > budget_max (bornes croisées)", () => {
    expect(() => normalizeScrapeParams({ zone: "Nice", budgetMin: 500000, budgetMax: 300000 })).toThrow(
      "budget_range_invalid",
    );
  });

  it("rejette surface_min > surface_max (bornes croisées)", () => {
    expect(() => normalizeScrapeParams({ zone: "Nice", surfaceMin: 120, surfaceMax: 40 })).toThrow(
      "surface_range_invalid",
    );
  });

  it("accepte min==max et min sans max", () => {
    expect(() => normalizeScrapeParams({ zone: "Nice", budgetMin: 300000, budgetMax: 300000 })).not.toThrow();
    expect(() => normalizeScrapeParams({ zone: "Nice", surfaceMin: 50 })).not.toThrow();
  });

  it("parse motsCles depuis string CSV ou tableau, en minuscules", () => {
    expect(normalizeScrapeParams({ zone: "X", motsCles: "Terrasse, VUE MER" }).motsCles).toEqual([
      "terrasse",
      "vue mer",
    ]);
    expect(normalizeScrapeParams({ zone: "X", motsCles: ["Balcon", " ", "Sud"] }).motsCles).toEqual([
      "balcon",
      "sud",
    ]);
    expect(normalizeScrapeParams({ zone: "X" }).motsCles).toEqual([]);
  });
});

describe("filterListings", () => {
  const mk = (over: Partial<MoteurImmoListing>): MoteurImmoListing => ({
    id: "1",
    typeBien: "appartement",
    titre: "Bel appartement",
    description: "lumineux",
    prix: 300000,
    surface: 60,
    pieces: 3,
    codePostal: "06600",
    ville: "Antibes",
    ...over,
  });
  const base = normalizeScrapeParams({ zone: "Antibes" });

  it("sans contrainte, garde tout", () => {
    const ls = [mk({}), mk({ id: "2", prix: 999999 })];
    expect(filterListings(ls, base)).toHaveLength(2);
  });

  it("filtre par budget min/max", () => {
    const p = normalizeScrapeParams({ zone: "X", budgetMin: 250000, budgetMax: 350000 });
    const ls = [mk({ id: "a", prix: 300000 }), mk({ id: "b", prix: 100000 }), mk({ id: "c", prix: 500000 })];
    expect(filterListings(ls, p).map((l) => l.id)).toEqual(["a"]);
  });

  it("filtre par surface et pièces min", () => {
    const p = normalizeScrapeParams({ zone: "X", surfaceMin: 50, piecesMin: 3 });
    const ls = [mk({ id: "ok", surface: 60, pieces: 3 }), mk({ id: "smallSurf", surface: 40 }), mk({ id: "fewRooms", pieces: 2 })];
    expect(filterListings(ls, p).map((l) => l.id)).toEqual(["ok"]);
  });

  it("filtre par mots-clés (ET, sur titre+description)", () => {
    const p = normalizeScrapeParams({ zone: "X", motsCles: "terrasse, sud" });
    const ls = [
      mk({ id: "match", titre: "Appt terrasse plein sud", description: "" }),
      mk({ id: "partial", titre: "Appt terrasse", description: "nord" }),
      mk({ id: "none", titre: "Studio", description: "" }),
    ];
    expect(filterListings(ls, p).map((l) => l.id)).toEqual(["match"]);
  });

  it("une borne nulle ne filtre pas ce champ ; un prix nul passe les bornes prix", () => {
    const p = normalizeScrapeParams({ zone: "X", budgetMax: 200000 });
    const ls = [mk({ id: "noPrice", prix: undefined }), mk({ id: "cheap", prix: 150000 }), mk({ id: "pricey", prix: 400000 })];
    // prix undefined → non filtré (on ne sait pas) ; cheap garde ; pricey exclu
    expect(filterListings(ls, p).map((l) => l.id)).toEqual(["noPrice", "cheap"]);
  });
});
