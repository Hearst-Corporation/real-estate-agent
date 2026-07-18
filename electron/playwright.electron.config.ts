import { defineConfig } from "@playwright/test";

/**
 * Config Playwright dédiée aux smoke tests Electron.
 *
 * Volontairement SANS `webServer` : le test pilote l'app Electron packagée
 * (`dist-electron/main.js`), qui charge elle-même son URL d'environnement.
 * On ne démarre donc pas le dev server Next (le config e2e racine le fait via
 * Turbopack, qui panique sur un `node_modules` symliké dans les worktrees).
 */
export default defineConfig({
  testDir: "./__tests__",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
});
