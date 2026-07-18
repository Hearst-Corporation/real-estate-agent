import { defineConfig } from "@playwright/test";

/**
 * Config Playwright E2E (QA — REA-M04-14).
 *
 * webServer : `next dev --webpack` et NON `--turbopack`. En worktree isolé,
 * `node_modules` est un symlink → Turbopack panique au boot. Webpack démarre
 * proprement. `reuseExistingServer: true` réutilise un serveur déjà lancé
 * (dev QA manuel) au lieu d'en relancer un.
 *
 * Les specs sont tolérantes à l'environnement : chaque parcours qui exige la DB
 * ou les identifiants admin se `test.skip()` proprement si absents, plutôt que
 * de rendre un faux rouge. Aucune donnée PII n'est écrite : les fixtures E2E
 * utilisent des marqueurs `[E2E]`, des emails `@example.com` et des numéros
 * `06 00 00 00 0X`.
 */
export default defineConfig({
  testDir: "./e2e",
  // Une seule authentification pour toute la suite (voir e2e/global-setup.ts) :
  // le login est rate-limité par le produit, se connecter par test le faisait
  // saturer et transformait les 429 en `skip` silencieux (faux vert).
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node_modules/.bin/next dev --webpack -p 3002",
    url: "http://localhost:3002/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
