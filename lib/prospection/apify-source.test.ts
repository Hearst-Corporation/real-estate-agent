import { describe, it, expect, vi, beforeEach } from "vitest";

// Contrôle de la config + de la source Apify sous-jacente.
const apifyIsConfigured = vi.fn();
const fetchListingComparables = vi.fn();
vi.mock("@/lib/estimation/listings", () => ({
  apifyIsConfigured: () => apifyIsConfigured(),
  fetchListingComparables: (q: unknown) => fetchListingComparables(q),
}));

import { searchListingsApify, apifyProspectionIsConfigured } from "./apify-source";

beforeEach(() => {
  apifyIsConfigured.mockReset();
  fetchListingComparables.mockReset();
});

describe("mode dégradé — Apify absent", () => {
  it("searchListingsApify → [] sans appeler la source ni crasher", async () => {
    apifyIsConfigured.mockReturnValue(false);
    const res = await searchListingsApify("06600");
    expect(res).toEqual([]);
    expect(fetchListingComparables).not.toHaveBeenCalled();
    expect(apifyProspectionIsConfigured()).toBe(false);
  });
});

describe("mapping Apify → MoteurImmoListing", () => {
  it("convertit les listings et résout le CP en commune", async () => {
    apifyIsConfigured.mockReturnValue(true);
    fetchListingComparables.mockResolvedValue({
      listings: [
        {
          id: "lbc-1",
          url: "https://lbc/1",
          titre: "Appartement vue mer",
          prix: 350000,
          surface_m2: 65,
          prix_m2: 5384,
          nb_pieces: 3,
          date_publication: "2026-07-01",
          statut: "actif",
        },
      ],
      source: "apify",
    });

    const res = await searchListingsApify("06600");
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("lbc-1");
    expect(res[0].prix).toBe(350000);
    expect(res[0].surface).toBe(65);
    expect(res[0].codePostal).toBe("06600");
    expect(res[0].ville).toBe("Antibes"); // 06600 → Antibes
    // La query part bien avec la commune résolue.
    expect(fetchListingComparables).toHaveBeenCalledWith(
      expect.objectContaining({ ville: "Antibes", codePostal: "06600" }),
    );
  });

  it("liste vide de la source → [] (pas de crash)", async () => {
    apifyIsConfigured.mockReturnValue(true);
    fetchListingComparables.mockResolvedValue({ listings: [], source: "none" });
    expect(await searchListingsApify("Nice")).toEqual([]);
  });
});
