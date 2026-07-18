/**
 * Vérifie que le PDF / partage REFLÈTENT la provenance honnête et ne présentent
 * jamais une source absente comme certaine (mission REA-M04-12).
 *
 * On rend la brochure via renderBrochureHtml (le même chemin que /pdf et
 * /brochure/[token]/pdf) et on inspecte le HTML produit.
 */
import { describe, it, expect } from "vitest";
import { renderBrochureHtml } from "./render-html";
import { READY_FIXTURE } from "./fixtures";
import type { Estimation, MarketAnalysis } from "@/lib/estimation/types";
import type { ProviderProvenance } from "@/lib/estimation/provenance";

/** Clone la fixture ready en surchargeant provenance + market. */
function withProvenance(
  provenance: ProviderProvenance[] | null,
  marketOver?: Partial<MarketAnalysis>,
): Estimation {
  return {
    ...READY_FIXTURE,
    provenance,
    market: READY_FIXTURE.market
      ? { ...READY_FIXTURE.market, ...marketOver }
      : READY_FIXTURE.market,
  };
}

describe("brochure — reflet honnête de la provenance", () => {
  it("chemin nominal : les sources contributrices apparaissent avec leur statut réel", () => {
    // READY_FIXTURE porte déjà une provenance (geo/cadastre/dvf/listings live).
    const html = renderBrochureHtml(READY_FIXTURE);
    // Les libellés de source pilotés par la provenance sont présents.
    expect(html).toContain("Ventes DVF (Etalab)");
    expect(html).toContain("Cadastre IGN");
    // Le statut honnête « à jour » figure au moins une fois.
    expect(html).toContain("à jour");
    // Aucun motif firewall n'a fait sauter le rendu (2 pages toujours là).
    expect((html.match(/class="page"/g) ?? []).length).toBe(2);
  });

  it("DPE fourni au dossier → ADEME marquée « indisponible », pas présentée comme source active", () => {
    // Fixture a dpe via 'provided' → ademe unavailable.
    const html = renderBrochureHtml(READY_FIXTURE);
    expect(html).toContain("indisponible");
    // ADEME apparaît (dans la liste des sources non contributrices), MAIS
    // accompagnée de « indisponible » — jamais comme socle certain.
    expect(html).toContain("DPE ADEME");
  });

  it("marché actif sans annonce → aucun portail nommé présenté comme ayant contribué", () => {
    // 0 annonce + provenance listings unavailable : ni « LeBonCoin » ni « Bienici »
    // ne doivent apparaître comme source active.
    const prov: ProviderProvenance[] = [
      { key: "geocode", label: "Géocodage", status: "live", count: null, detail: "BAN" },
      { key: "cadastre", label: "Cadastre IGN", status: "live", count: null, detail: "parcelle résolue" },
      { key: "dvf", label: "Ventes DVF (Etalab)", status: "live", count: 5, detail: "5 ventes comparables" },
      { key: "ademe", label: "DPE ADEME", status: "unavailable", count: null, detail: "DPE non renseigné" },
      { key: "listings", label: "Marché actif", status: "unavailable", count: 0, detail: "aucune annonce détectée" },
    ];
    const est = withProvenance(prov, { listing_comparables: [], listing_source: undefined });
    const html = renderBrochureHtml(est);
    expect(html).not.toContain("LeBonCoin");
    expect(html).not.toContain("Bienici");
    // La source « Marché actif » est bien listée comme indisponible.
    expect(html).toContain("Marché actif");
    expect(html).toContain("indisponible");
  });

  it("géocodage en secours → statut « source de secours » visible dans le PDF", () => {
    const prov: ProviderProvenance[] = [
      { key: "geocode", label: "Géocodage", status: "fallback", count: null, detail: "Géoplateforme IGN (secours)" },
      { key: "cadastre", label: "Cadastre IGN", status: "live", count: null, detail: "parcelle résolue" },
      { key: "dvf", label: "Ventes DVF (Etalab)", status: "live", count: 4, detail: "4 ventes comparables" },
      { key: "ademe", label: "DPE ADEME", status: "live", count: null, detail: "classe résolue via ADEME" },
      { key: "listings", label: "Marché actif", status: "live", count: 3, detail: "LeBonCoin" },
    ];
    const html = renderBrochureHtml(withProvenance(prov));
    expect(html).toContain("source de secours");
  });

  it("estimation pré-provenance (provenance null) → socle statique historique, jamais d'écran cassé", () => {
    const html = renderBrochureHtml(withProvenance(null));
    // Fallback : les sources statiques restent affichées (rétro-compat).
    expect(html).toContain("DVF Etalab");
    expect(html).toContain("BAN");
    expect((html.match(/class="page"/g) ?? []).length).toBe(2);
  });

  it("statuts de provenance ne déclenchent aucun motif interdit du firewall (§1-8)", () => {
    // Rendu réussi = le firewall (throw en test) n'a rien intercepté.
    expect(() => renderBrochureHtml(READY_FIXTURE)).not.toThrow();
  });
});
