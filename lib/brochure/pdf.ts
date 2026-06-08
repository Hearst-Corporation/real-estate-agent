/**
 * lib/brochure/pdf.ts — Rendu PDF via Playwright (HMR-safe, env-branché).
 *
 * - Dev / Railway : playwright-core chromium local
 * - Vercel / Lambda : @sparticuz/chromium headless shell
 * - Singleton browser HMR-safe via globalThis[Symbol.for("app.brochure.browser")]
 * - Sémaphore max 2 rendus simultanés
 */

import type { Browser } from "playwright-core";

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const KEY = Symbol.for("app.brochure.browser");
type G = typeof globalThis & { [KEY]?: Promise<Browser> };

async function launchBrowser(): Promise<Browser> {
  const isServerless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // Vercel / Lambda → sparticuz chromium headless shell
    try {
      const chromium = (await import("@sparticuz/chromium")).default;
      const { chromium: pw } = await import("playwright-core");
      return await pw.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pdf_chromium_unavailable: Chromium introuvable — lance 'npx playwright install chromium' (local/Railway) ou vérifie @sparticuz/chromium (Vercel). Cause: ${msg}`
      );
    }
  } else {
    // Local / Railway → playwright-core bundled chromium
    try {
      const { chromium } = await import("playwright-core");
      return await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--font-render-hinting=none",
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pdf_chromium_unavailable: Chromium introuvable — lance 'npx playwright install chromium' (local/Railway) ou vérifie @sparticuz/chromium (Vercel). Cause: ${msg}`
      );
    }
  }
}

async function getBrowser(): Promise<Browser> {
  const g = globalThis as G;
  if (g[KEY]) return g[KEY]!;

  const promise = launchBrowser().then((browser) => {
    // Retire du cache si le browser se déconnecte (crash, HMR reload)
    browser.on("disconnected", () => {
      delete g[KEY];
    });
    // Nettoyage propre à l'arrêt du process
    process.once("SIGTERM", () => browser.close().catch(() => {}));
    process.once("beforeExit", () => browser.close().catch(() => {}));
    return browser;
  });

  g[KEY] = promise;
  return promise;
}

// ── Sémaphore max 2 ───────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;
let _running = 0;
const _queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (_running < MAX_CONCURRENT) {
    _running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => _queue.push(resolve));
}

function release(): void {
  const next = _queue.shift();
  if (next) {
    next();
  } else {
    _running--;
  }
}

// ── renderEstimationPdf ───────────────────────────────────────────────────────

/**
 * Génère un PDF A4 au format Buffer depuis un HTML complet (autonome, avec CSS inline).
 * Les marges sont 0 (les paddings des .sheet fournissent les marges réelles).
 */
export async function renderEstimationPdf(html: string): Promise<Buffer> {
  await acquire();
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();

    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    await page.emulateMedia({ media: "print" });

    // Attendre que les Google Fonts soient chargées (ou timeout 4s)
    await Promise.race([
      page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready),
      new Promise((r) => setTimeout(r, 4000)),
    ]);

    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdfUint8);
  } finally {
    await ctx.close();
    release();
  }
}
