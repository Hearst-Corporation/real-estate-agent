/**
 * Tests de la normalisation PURE multi-sources (lib/prospection/normalize.ts).
 *
 * Prouve :
 *   - FIXTURES multi-sources (moteurimmo / leboncoin / bienici) : chaque source
 *     brute produit une ligne canonique `prosp_annonces` correcte.
 *   - PARITÉ avec l'ingestion : la ligne produite est IDENTIQUE à
 *     `toAnnonceRow(parse(raw))` — c'est-à-dire exactement ce que `upsertAnnonces`
 *     écrirait (mêmes fonctions, aucune divergence). Le `hash_dedup` est celui de
 *     `hashDedup` (dédup cohérente avec la base).
 *   - DÉTERMINISME : deux normalisations avec le même `nowIso` sont égales octet
 *     pour octet ; `updated_at` = `nowIso` injecté (aucune horloge implicite).
 *   - AUCUNE PERSISTANCE : le module n'importe aucun client DB (test statique).
 *   - Source inconnue → UnknownSourceError (fail-closed).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeListings,
  parseRawListings,
  UnknownSourceError,
  toAnnonceRow,
  hashDedup,
} from "./normalize";

const TENANT = "tenant-xyz";
const NOW = "2026-07-17T10:00:00.000Z";

// ── Fixtures BRUTES par source (formes réelles des datasets) ─────────────────

// MoteurImmo : format API (snake_case + variantes camelCase).
const MOTEURIMMO_RAW = [
  {
    id: "mi-100",
    type_bien: "Appartement",
    titre: "T3 vue mer",
    prix: 345000,
    surface: 68,
    pieces: 3,
    code_postal: "06600",
    ville: "Antibes",
    latitude: 43.58,
    longitude: 7.12,
    ascenseur: true,
    is_pap: true,
    date_publication: "2026-07-01T00:00:00Z",
    url: "https://moteurimmo.fr/mi-100",
  },
  {
    reference: "mi-101", // identité via `reference` (fallback)
    typeBien: "maison",
    price: 720000,
    surface_habitable: 130,
    nb_pieces: 5,
    cp: "06160",
    city: "Antibes",
    jardin: true,
  },
];

// LeBonCoin (dataset Apify) : price_eur / surface_m2 / rooms / location_*.
const LEBONCOIN_RAW = [
  {
    id: "lbc-200",
    title: "Appartement lumineux",
    price_eur: 289000,
    surface_m2: 55,
    rooms: 2,
    location_district: "06400",
    published_at: "2026-06-15T00:00:00Z",
    url: "https://leboncoin.fr/200",
  },
  {
    // Location → DOIT être exclue par normalizeApify (parité avec l'estimation).
    id: "lbc-rent",
    title: "Location meublée",
    price_eur: 1200,
    surface_m2: 30,
    sale_type: "location",
  },
];

// Bienici (dataset Apify, même parser normalizeApify, source distincte).
const BIENICI_RAW = [
  {
    id: "bi-300",
    title: "Studio centre",
    price: 165000,
    surface: 28,
    rooms: 1,
    location_city: "Cannes",
    url: "https://bienici.com/300",
  },
];

// ── Fixtures multi-sources ───────────────────────────────────────────────────
describe("normalizeListings — fixtures multi-sources", () => {
  it("moteurimmo : produit des lignes canoniques prosp_annonces (source=moteurimmo)", () => {
    const res = normalizeListings(TENANT, "moteurimmo", MOTEURIMMO_RAW, NOW);
    expect(res.source).toBe("moteurimmo");
    expect(res.normalized).toHaveLength(2);
    const [a, b] = res.normalized;
    expect(a.row.tenant_id).toBe(TENANT);
    expect(a.row.source).toBe("moteurimmo");
    expect(a.row.source_id).toBe("mi-100");
    expect(a.row.type_bien).toBe("appartement"); // lower-cased par le parser
    expect(a.row.titre).toBe("T3 vue mer");
    expect(a.row.surface).toBe(68);
    expect(a.row.ville).toBe("Antibes");
    expect(a.row.is_pap).toBe(true);
    expect(a.row.updated_at).toBe(NOW);
    // Identité par `reference` reconnue.
    expect(b.row.source_id).toBe("mi-101");
    expect(b.row.type_bien).toBe("maison");
  });

  it("leboncoin : normalise et EXCLUT les locations (alias source apify_lbc)", () => {
    const res = normalizeListings(TENANT, "leboncoin", LEBONCOIN_RAW, NOW);
    // Colonne source canonique = apify_lbc (cohérent avec listings.collect).
    expect(res.source).toBe("apify_lbc");
    // La location (lbc-rent) est écartée par le parser → 1 seule annonce.
    expect(res.normalized).toHaveLength(1);
    expect(res.skipped).toBe(1);
    expect(res.normalized[0].row.source_id).toBe("lbc-200");
    expect(res.normalized[0].row.prix).toBe(289000);
    expect(res.normalized[0].row.surface).toBe(55);
  });

  it("bienici : normalise via le même parser Apify, source=bienici", () => {
    const res = normalizeListings(TENANT, "bienici", BIENICI_RAW, NOW);
    expect(res.source).toBe("bienici");
    expect(res.normalized).toHaveLength(1);
    expect(res.normalized[0].row.source).toBe("bienici");
    expect(res.normalized[0].row.source_id).toBe("bi-300");
    expect(res.normalized[0].row.prix).toBe(165000);
  });

  it("apify_lbc (alias direct) équivaut à leboncoin", () => {
    const viaAlias = normalizeListings(TENANT, "apify_lbc", LEBONCOIN_RAW, NOW);
    const viaName = normalizeListings(TENANT, "leboncoin", LEBONCOIN_RAW, NOW);
    expect(viaAlias.normalized.map((n) => n.row)).toEqual(viaName.normalized.map((n) => n.row));
  });
});

// ── PARITÉ avec l'ingestion (mêmes fonctions que upsertAnnonces) ─────────────
describe("normalizeListings — parité avec l'ingestion réelle", () => {
  it("moteurimmo : chaque ligne == toAnnonceRow(parseRawListings(...)) (chemin d'écriture)", () => {
    const parsed = parseRawListings("moteurimmo", MOTEURIMMO_RAW);
    const expected = parsed.map((l) => toAnnonceRow(TENANT, "moteurimmo", l, NOW));
    const got = normalizeListings(TENANT, "moteurimmo", MOTEURIMMO_RAW, NOW).normalized.map(
      (n) => n.row,
    );
    // Égalité structurelle stricte : la normalisation gateway = le mapping que
    // `upsertAnnonces` applique avant d'écrire (aucune divergence).
    expect(got).toEqual(expected);
  });

  it("leboncoin : le hash_dedup == hashDedup(listing parsé) (dédup cohérente base)", () => {
    const parsed = parseRawListings("leboncoin", LEBONCOIN_RAW);
    const res = normalizeListings(TENANT, "leboncoin", LEBONCOIN_RAW, NOW);
    expect(parsed).toHaveLength(1);
    expect(res.normalized[0].hashDedup).toBe(hashDedup(parsed[0]));
    // Le hash de la ligne et l'empreinte retournée sont le même.
    expect(res.normalized[0].row.hash_dedup).toBe(res.normalized[0].hashDedup);
  });
});

// ── Déterminisme ─────────────────────────────────────────────────────────────
describe("normalizeListings — déterminisme", () => {
  it("même entrée + même nowIso → sortie identique (JSON stable)", () => {
    const a = normalizeListings(TENANT, "moteurimmo", MOTEURIMMO_RAW, NOW);
    const b = normalizeListings(TENANT, "moteurimmo", MOTEURIMMO_RAW, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("updated_at reflète EXACTEMENT le nowIso injecté (aucune horloge implicite)", () => {
    const other = "2000-01-01T00:00:00.000Z";
    const res = normalizeListings(TENANT, "moteurimmo", MOTEURIMMO_RAW, other);
    for (const n of res.normalized) expect(n.row.updated_at).toBe(other);
  });
});

// ── Fail-closed source inconnue ──────────────────────────────────────────────
describe("normalizeListings — fail-closed", () => {
  it("source inconnue → UnknownSourceError (jamais un parse au hasard)", () => {
    expect(() => normalizeListings(TENANT, "seloger", [{ id: "x" }], NOW)).toThrow(
      UnknownSourceError,
    );
    expect(() => parseRawListings("seloger", [])).toThrow(UnknownSourceError);
  });

  it("items non-objet ignorés côté moteurimmo (skipped), aucun crash", () => {
    const res = normalizeListings(
      TENANT,
      "moteurimmo",
      [{ id: "ok-1", type_bien: "appartement" }],
      NOW,
    );
    expect(res.normalized).toHaveLength(1);
    expect(res.normalized[0].row.source_id).toBe("ok-1");
  });
});

// ── Aucune persistance (garde-fou statique) ──────────────────────────────────
describe("normalize.ts — aucune persistance", () => {
  it("le module n'importe AUCUN client DB / Supabase", () => {
    const src = readFileSync(join(__dirname, "normalize.ts"), "utf8");
    expect(src).not.toMatch(/getGpu1Admin|@\/lib\/gpu1|\.from\(/);
    // Aucune écriture DB : pas d'insert/upsert/update dans le module.
    expect(src).not.toMatch(/\.(insert|upsert|update)\(/);
  });
});
