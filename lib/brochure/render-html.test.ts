import { describe, it, expect } from "vitest";
import { renderBrochureHtml } from "./render-html";
import { READY_FIXTURE } from "./fixtures";

describe("renderBrochureHtml (contenu réel, données persistées)", () => {
  const html = renderBrochureHtml(READY_FIXTURE);

  it("produit un document HTML complet et autonome (CSS inline, pas d'écran blanc)", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>");
    // Deux pages (contrat brochure = 2 pages strict).
    expect((html.match(/class="page"/g) ?? []).length).toBe(2);
  });

  it("porte la valeur, la fourchette, le prix/m² et les comparables issus de l'estimation", () => {
    // Valeur vénale (397 500 € formaté fr-FR avec espace insécable).
    expect(html).toMatch(/397\s?500/);
    // Fourchette (380 k€ – 415 k€).
    expect(html).toContain("380");
    expect(html).toContain("415");
    // Prix conseillé.
    expect(html).toMatch(/409\s?000/);
    // Prix au m² ajusté.
    expect(html).toContain("300"); // 5 300 €/m²
    // Nombre de comparables.
    expect(html).toContain("Comparables");
  });

  it("porte l'identité agence (branding), la date, les sources et les mentions/avertissements", () => {
    expect(html).toContain("Azigo");
    expect(html).toContain("DVF"); // sources officielles
    expect(html).toContain("BAN");
    expect(html).toContain("Avis de valeur indicatif"); // avertissement légal
    expect(html).toContain("valable 6 mois");
  });

  it("échappe le contenu injecté (pas d'injection HTML via l'adresse)", () => {
    const evil = renderBrochureHtml({
      ...READY_FIXTURE,
      property: {
        ...READY_FIXTURE.property,
        adresse: '<script>alert(1)</script>',
      },
    });
    // renderToStaticMarkup échappe : le tag brut ne doit jamais apparaître.
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).toContain("&lt;script&gt;");
  });
});
