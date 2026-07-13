import { describe, it, expect } from "vitest";
import { safeFetch } from "./safe-fetch";

// safeFetch : garde d'hôte (allowlist) + garde de schéma (défense en profondeur SSRF).
// Ces cas throw AVANT tout appel réseau → pas de fetch réel, pas de mock nécessaire.

describe("safeFetch — garde de schéma (http/https uniquement)", () => {
  it("rejette file:", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/schéma non autorisé/);
  });

  it("rejette ftp:", async () => {
    await expect(safeFetch("ftp://data.geopf.fr/x")).rejects.toThrow(/schéma non autorisé/);
  });

  it("rejette data:", async () => {
    await expect(safeFetch("data:text/plain,hello")).rejects.toThrow(/schéma non autorisé/);
  });

  it("rejette gopher:", async () => {
    await expect(safeFetch("gopher://api-adresse.data.gouv.fr/")).rejects.toThrow(/schéma non autorisé/);
  });
});

describe("safeFetch — garde d'hôte (allowlist)", () => {
  it("rejette un hôte hors allowlist même en https", async () => {
    await expect(safeFetch("https://evil.example.com/x")).rejects.toThrow(/hôte non autorisé/);
  });

  it("rejette une URL malformée", async () => {
    await expect(safeFetch("not a url")).rejects.toThrow(/URL invalide/);
  });
});
