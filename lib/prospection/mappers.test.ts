import { describe, it, expect } from "vitest";
import { hashDedup, toAnnonceRow, dbRowToAnnonce } from "./mappers";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";

const base: MoteurImmoListing = {
  id: "lbc-42",
  typeBien: "appartement",
  titre: "Bel appartement lumineux",
  description: "vue mer",
  prix: 320000,
  surface: 62,
  pieces: 3,
  chambres: 2,
  codePostal: "06600",
  ville: "Antibes",
  latitude: 43.58,
  longitude: 7.12,
  url: "https://leboncoin.fr/42",
  photos: ["https://img/1.jpg"],
  isPap: true,
  datePublication: "2026-07-01T00:00:00Z",
};

describe("hashDedup", () => {
  it("est stable pour la même annonce", () => {
    expect(hashDedup(base)).toBe(hashDedup(base));
    expect(hashDedup(base)).toHaveLength(32);
  });

  it("bucketise surface (pas de 5) et prix (pas de 5000) → même hash", () => {
    // 61 et 62 tombent dans le même bucket (round(/5)*5 = 60).
    expect(hashDedup({ ...base, surface: 61 })).toBe(hashDedup({ ...base, surface: 62 }));
    // 320000 et 321000 tombent dans le même bucket (round(/5000)*5000 = 320000).
    expect(hashDedup({ ...base, prix: 321000 })).toBe(hashDedup({ ...base, prix: 320000 }));
  });

  it("change si type/CP/pièces changent", () => {
    expect(hashDedup({ ...base, codePostal: "75011" })).not.toBe(hashDedup(base));
    expect(hashDedup({ ...base, pieces: 4 })).not.toBe(hashDedup(base));
    expect(hashDedup({ ...base, typeBien: "maison" })).not.toBe(hashDedup(base));
  });
});

describe("toAnnonceRow — mapping vers le SCHÉMA RÉEL prosp_annonces", () => {
  it("écrit les vraies colonnes (source, titre, surface, pieces, ville, is_pap…)", () => {
    const row = toAnnonceRow("tenant-1", "apify_lbc", base, "2026-07-13T10:00:00Z");
    expect(row.tenant_id).toBe("tenant-1");
    expect(row.source).toBe("apify_lbc");
    expect(row.source_id).toBe("lbc-42");
    expect(row.titre).toBe("Bel appartement lumineux");
    expect(row.surface).toBe(62);
    expect(row.pieces).toBe(3);
    expect(row.ville).toBe("Antibes");
    expect(row.is_pap).toBe(true);
    expect(row.date_publication).toBe("2026-07-01T00:00:00Z");
    expect(row.hash_dedup).toBe(hashDedup(base));
    expect(row.photos).toEqual(["https://img/1.jpg"]);
  });

  it("N'utilise PAS les colonnes historiques désynchronisées", () => {
    const row = toAnnonceRow("t", "s", base) as Record<string, unknown>;
    expect(row).not.toHaveProperty("source_platform");
    expect(row).not.toHaveProperty("title");
    expect(row).not.toHaveProperty("surface_m2");
    expect(row).not.toHaveProperty("nb_pieces");
    expect(row).not.toHaveProperty("commune");
    expect(row).not.toHaveProperty("type_annonceur");
  });

  it("défauts sûrs quand les champs optionnels manquent", () => {
    const row = toAnnonceRow("t", "s", { id: "x", typeBien: "maison" });
    expect(row.is_pap).toBe(false);
    expect(row.republication).toBe(false);
    expect(row.photos).toEqual([]);
    expect(row.titre).toBeNull();
    expect(row.prix).toBeNull();
  });
});

describe("dbRowToAnnonce — lecture du schéma réel", () => {
  it("lit is_pap booléen et republication booléen", () => {
    const a = dbRowToAnnonce({
      id: "1",
      tenant_id: "t",
      source: "apify_lbc",
      source_id: "s1",
      hash_dedup: "h",
      type_bien: "appartement",
      titre: "T",
      surface: 50,
      pieces: 2,
      ville: "Nice",
      is_pap: true,
      republication: true,
      date_publication: "2026-01-01",
      prix_precedent: 200000,
    });
    expect(a.isPap).toBe(true);
    expect(a.republication).toBe(true);
    expect(a.ville).toBe("Nice");
    expect(a.prixPrecedent).toBe(200000);
  });
});
