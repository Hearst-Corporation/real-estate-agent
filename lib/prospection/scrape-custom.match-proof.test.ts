import { describe, it, expect } from "vitest";
import { matchAnnonce } from "./matching/match";
import { dbRowToAnnonce, dbRowToCritere } from "./mappers";
import { MATCH_SCORE_MIN_PERSIST } from "./types";

/**
 * Preuve du chemin AVEC données : une annonce dont le CP matche le préfixe de
 * zone d'un critère produit bien un match ≥ seuil. Garantit que scrapeCustomAndMatch
 * créera des prosp_matchs dès que l'actor Apify ramènera des annonces.
 */
describe("scrape-custom — chemin avec données (intégration matching)", () => {
  it("une annonce CP-cohérente matche un critère actif au-dessus du seuil", () => {
    const critere = dbRowToCritere({
      id: "c1", tenant_id: "t", user_id: "u", nom: "Famille Test",
      zones: ["75011"], type_bien: ["appartement"],
      budget_min: 200000, budget_max: 500000, pieces_min: 2, actif: true,
    });
    const annonce = dbRowToAnnonce({
      id: "a1", tenant_id: "t", source_id: "s1", hash_dedup: "h1",
      type_bien: "appartement", title: "Appartement Paris 11e",
      prix: 350000, surface_m2: 60, nb_pieces: 3, code_postal: "75011", commune: "Paris",
    });
    const result = matchAnnonce(critere, annonce);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(MATCH_SCORE_MIN_PERSIST);
  });

  it("matche par COMMUNE quand la zone est une ville (Apify ne résout pas toujours le CP)", () => {
    // Critère BienCible typique : zones = nom de ville, pas de CP.
    const critere = dbRowToCritere({
      id: "c2", tenant_id: "t", user_id: "u", nom: "Elena BATTAGION",
      zones: ["Antibes"], type_bien: ["appartement"],
      budget_min: 279000, budget_max: 356500, pieces_min: 2, actif: true,
    });
    const annonce = dbRowToAnnonce({
      id: "a2", tenant_id: "t", source_id: "s2", hash_dedup: "h2",
      type_bien: "appartement", prix: 320000, nb_pieces: 3,
      code_postal: "", commune: "Antibes", // CP vide → match par commune
    });
    const result = matchAnnonce(critere, annonce);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(MATCH_SCORE_MIN_PERSIST);
  });

  it("une annonce hors zone (CP ne matche pas le préfixe) est rejetée", () => {
    const critere = dbRowToCritere({ id: "c", tenant_id: "t", user_id: "u", nom: "X", zones: ["75011"], actif: true });
    const annonce = dbRowToAnnonce({ id: "a", tenant_id: "t", source_id: "s", hash_dedup: "h", type_bien: "appartement", prix: 300000, code_postal: "13001", commune: "Marseille" });
    expect(matchAnnonce(critere, annonce)).toBeNull();
  });
});
