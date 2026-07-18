import { describe, it, expect } from "vitest";
import {
  buildProvenance,
  parseProvenance,
  contributed,
  statusLabel,
  providerLabel,
  PROVIDER_STATUSES,
  type ProviderProvenance,
} from "./provenance";

// ─── Règle de vérité : provider indisponible → jamais une donnée fabriquée ────

describe("buildProvenance — statut honnête par source", () => {
  it("géocodage échoué → tout indisponible en aval, aucune donnée inventée", () => {
    const p = buildProvenance({
      geocode: null,
      cadastreResolved: false,
      dvfComparables: 0,
      dpe: null,
      listings: { source: "none", count: 0, fallbackUsed: false },
    });
    const by = Object.fromEntries(p.map((x) => [x.key, x]));
    expect(by.geocode.status).toBe("unavailable");
    expect(by.cadastre.status).toBe("unavailable");
    expect(by.dvf.status).toBe("unavailable");
    expect(by.dvf.count).toBe(0);
    expect(by.ademe.status).toBe("unavailable");
    expect(by.listings.status).toBe("unavailable");
    // AUCUNE source n'est marquée « live » quand rien n'a été obtenu.
    expect(p.every((x) => x.status === "unavailable")).toBe(true);
  });

  it("géocodage via failover → statut fallback (secours), pas live", () => {
    const p = buildProvenance({
      geocode: { via: "fallback" },
      cadastreResolved: true,
      dvfComparables: 5,
      dpe: { via: "ademe" },
      listings: { source: "apify", count: 4, fallbackUsed: false },
    });
    const geo = p.find((x) => x.key === "geocode")!;
    expect(geo.status).toBe("fallback");
    expect(geo.detail).toMatch(/secours/i);
  });

  it("chemin nominal complet → live partout, comptes réels reportés", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 7,
      dpe: { via: "ademe" },
      listings: { source: "apify", count: 6, fallbackUsed: false },
    });
    const by = Object.fromEntries(p.map((x) => [x.key, x]));
    expect(by.geocode.status).toBe("live");
    expect(by.dvf.status).toBe("live");
    expect(by.dvf.count).toBe(7);
    expect(by.ademe.status).toBe("live");
    expect(by.listings.status).toBe("live");
    expect(by.listings.count).toBe(6);
  });

  it("DVF sans comparable → unavailable même si géocodage OK (jamais 'live' à vide)", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 0,
      dpe: null,
      listings: { source: "none", count: 0, fallbackUsed: false },
    });
    const dvf = p.find((x) => x.key === "dvf")!;
    expect(dvf.status).toBe("unavailable");
    expect(dvf.count).toBe(0);
    expect(dvf.detail).toMatch(/aucune vente/i);
  });

  it("DPE fourni par le vendeur → ADEME n'est PAS présentée comme contributrice", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 5,
      dpe: { via: "provided" },
      listings: { source: "apify", count: 3, fallbackUsed: false },
    });
    const ademe = p.find((x) => x.key === "ademe")!;
    // Le DPE existe mais ADEME n'a rien fourni → statut non-contributeur.
    expect(contributed(ademe.status)).toBe(false);
    expect(ademe.detail).toMatch(/hors ADEME|fourni/i);
  });

  it("annonces via secours → fallback, avec le portail de secours nommé", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 5,
      dpe: { via: "ademe" },
      listings: { source: "myswarms", count: 2, fallbackUsed: true },
    });
    const l = p.find((x) => x.key === "listings")!;
    expect(l.status).toBe("fallback");
    expect(l.detail).toMatch(/Bienici/);
    expect(l.detail).toMatch(/secours/i);
  });

  it("source 'apify' déclarée mais 0 annonce → indisponible (pas de portail nommé à vide)", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 5,
      dpe: { via: "ademe" },
      listings: { source: "apify", count: 0, fallbackUsed: false },
    });
    const l = p.find((x) => x.key === "listings")!;
    expect(l.status).toBe("unavailable");
    expect(l.detail).toMatch(/aucune annonce/i);
  });

  it("est déterministe : mêmes entrées → sortie identique et ordre stable", () => {
    const input = {
      geocode: { via: "primary" as const },
      cadastreResolved: true,
      dvfComparables: 4,
      dpe: { via: "ademe" as const },
      listings: { source: "apify" as const, count: 3, fallbackUsed: false },
    };
    expect(buildProvenance(input)).toEqual(buildProvenance(input));
    expect(buildProvenance(input).map((x) => x.key)).toEqual([
      "geocode",
      "cadastre",
      "dvf",
      "ademe",
      "listings",
    ]);
  });
});

// ─── Statuts / helpers d'affichage ────────────────────────────────────────────

describe("helpers de statut", () => {
  it("contributed = true pour live/snapshot/fallback, false pour unavailable", () => {
    expect(contributed("live")).toBe(true);
    expect(contributed("snapshot")).toBe(true);
    expect(contributed("fallback")).toBe(true);
    expect(contributed("unavailable")).toBe(false);
  });

  it("chaque statut a un libellé FR non vide, et aucun ne contient de motif firewall", () => {
    // Le PDF passe un firewall dev (confiance/score/à confirmer interdits en §1-8).
    const FORBIDDEN = /(confiance|score|à\s+confirmer)/i;
    for (const s of PROVIDER_STATUSES) {
      const l = statusLabel(s);
      expect(l.length).toBeGreaterThan(0);
      expect(l).not.toMatch(FORBIDDEN);
    }
  });

  it("providerLabel renvoie un libellé humain pour chaque source", () => {
    expect(providerLabel("dvf")).toMatch(/DVF/);
    expect(providerLabel("geocode")).toMatch(/[Gg]éocodage/);
  });
});

// ─── Lecture défensive (persistance JSON ↔ affichage) ─────────────────────────

describe("parseProvenance — tolérance aux données persistées", () => {
  it("null / non-array → []", () => {
    expect(parseProvenance(null)).toEqual([]);
    expect(parseProvenance(undefined)).toEqual([]);
    expect(parseProvenance({})).toEqual([]);
    expect(parseProvenance("nope")).toEqual([]);
  });

  it("round-trip : buildProvenance → JSON → parseProvenance conserve les statuts", () => {
    const built = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 5,
      dpe: { via: "ademe" },
      listings: { source: "apify", count: 3, fallbackUsed: false },
    });
    const roundTripped = parseProvenance(JSON.parse(JSON.stringify(built)));
    expect(roundTripped).toEqual(built);
  });

  it("écarte les entrées mal formées plutôt que de casser", () => {
    const raw = [
      { key: "dvf", label: "Ventes DVF", status: "live", count: 5, detail: "5 ventes" },
      { key: "geocode", status: "not-a-status" }, // statut invalide → écarté
      { nope: true }, // pas de key → écarté
      42, // primitif → écarté
      { key: "listings", status: "unavailable", count: null, detail: null }, // label absent → dérivé
    ] as unknown;
    const parsed = parseProvenance(raw);
    expect(parsed.map((p) => p.key)).toEqual(["dvf", "listings"]);
    // label dérivé quand absent
    expect(parsed[1].label).toMatch(/[Mm]arché actif/);
  });

  it("count non numérique persisté → normalisé à null (jamais NaN affiché)", () => {
    const parsed = parseProvenance([
      { key: "dvf", status: "live", count: "oops", detail: "x" },
    ]);
    expect(parsed[0].count).toBeNull();
  });
});

// ─── Garantie de forme : contrat stable pour le PDF ───────────────────────────

describe("contrat ProviderProvenance", () => {
  it("les clés produites couvrent les 5 sources pipeline attendues", () => {
    const p = buildProvenance({
      geocode: { via: "primary" },
      cadastreResolved: true,
      dvfComparables: 1,
      dpe: { via: "ademe" },
      listings: { source: "apify", count: 1, fallbackUsed: false },
    });
    const keys = new Set(p.map((x: ProviderProvenance) => x.key));
    for (const k of ["geocode", "cadastre", "dvf", "ademe", "listings"]) {
      expect(keys.has(k as ProviderProvenance["key"])).toBe(true);
    }
  });
});
