import { _electron as electron, type ElectronApplication, expect, test } from "@playwright/test";
import path from "node:path";

const MAIN = path.join(__dirname, "..", "..", "dist-electron", "main.js");

/**
 * Lance l'app Electron packagée.
 *
 * `ELECTRON_RUN_AS_NODE` est explicitement retiré de l'environnement : quand
 * cette variable est posée (cas de certains sandboxes/CI), Electron démarre en
 * simple Node et `require("electron")` renvoie le chemin du binaire au lieu de
 * l'API → `app`/`ipcMain`/`BrowserWindow` deviennent `undefined` et le process
 * meurt (« Process failed to launch! »). On la neutralise pour un run fiable.
 */
async function launchApp(): Promise<ElectronApplication> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ args: [MAIN], env });
}

test("splash → sélection env local → fenêtre principale créée", async () => {
  const app = await launchApp();
  const splash = await app.firstWindow();

  await expect(splash).toHaveTitle(/.+/);
  const localBtn = splash.locator("button.local");
  await expect(localBtn).toBeVisible();
  await localBtn.click();

  const main = await app.waitForEvent("window");
  await main.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  // La fenêtre principale pointe bien vers l'URL d'environnement local.
  expect(main.url()).toContain("localhost:3002");

  await app.close();
});

test("le splash mémorise le dernier environnement choisi", async () => {
  const app = await launchApp();
  const splash = await app.firstWindow();
  // L'API préchargée expose bien getLastEnv (surface minimale, pas d'ipcRenderer brut).
  const lastEnv = await splash.evaluate(async () => {
    const api = (window as unknown as { electron?: { getLastEnv?: () => Promise<string> } }).electron;
    if (!api?.getLastEnv) return null;
    return api.getLastEnv();
  });
  expect(lastEnv === "local" || lastEnv === "prod").toBe(true);
  await app.close();
});

test("preload : surface d'API minimale, aucun accès Node exposé au renderer", async () => {
  const app = await launchApp();
  const splash = await app.firstWindow();
  const surface = await splash.evaluate(() => {
    const w = window as unknown as {
      electron?: Record<string, unknown>;
      require?: unknown;
      process?: unknown;
    };
    return {
      keys: w.electron ? Object.keys(w.electron).sort() : null,
      hasRequire: typeof w.require !== "undefined",
      hasProcess: typeof w.process !== "undefined",
      hasIpcRenderer: !!(w.electron && "ipcRenderer" in w.electron),
    };
  });
  // Exactement selectEnv / getLastEnv / platform — rien de plus.
  expect(surface.keys).toEqual(["getLastEnv", "platform", "selectEnv"]);
  // contextIsolation + sandbox → pas de require/process/ipcRenderer dans le renderer.
  expect(surface.hasRequire).toBe(false);
  expect(surface.hasProcess).toBe(false);
  expect(surface.hasIpcRenderer).toBe(false);
  await app.close();
});
