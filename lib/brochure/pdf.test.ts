import { describe, it, expect, beforeAll } from "vitest";
import { renderBrochureHtml } from "./render-html";
import { READY_FIXTURE } from "./fixtures";

/**
 * Preuve de génération PDF réelle : on rend la brochure d'une estimation "ready"
 * via le vrai moteur (Playwright/Chromium) et on vérifie l'en-tête %PDF, une
 * taille non nulle et le multi-page.
 *
 * Chromium introuvable (env CI minimal sans navigateur) → le test se SKIP
 * proprement plutôt que de rougir faussement. Quand Chromium est présent, la
 * preuve est stricte.
 */
async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright-core");
    const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

describe("renderEstimationPdf (preuve de génération PDF réelle)", () => {
  let hasChromium = false;

  beforeAll(async () => {
    hasChromium = await chromiumAvailable();
  }, 60_000);

  it("génère un PDF valide (%PDF, taille > 1 Ko, multi-page)", async () => {
    if (!hasChromium) {
       
      console.warn("[pdf.test] Chromium indisponible → test SKIP (pas d'échec).");
      return;
    }
    const { renderEstimationPdf } = await import("./pdf");
    const html = renderBrochureHtml(READY_FIXTURE);
    const buf = await renderEstimationPdf(html);

    // En-tête magique PDF.
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Taille non nulle et plausible.
    expect(buf.length).toBeGreaterThan(1024);
    // Multi-page : le contrat brochure = 2 pages. On compte les objets /Page.
    const pages = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
