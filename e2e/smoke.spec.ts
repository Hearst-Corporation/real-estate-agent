import { test, expect } from "@playwright/test";
import {
  readAdminCreds,
  loginPage,
  hasNoHorizontalScroll,
  isDevBypassActive,
} from "./_helpers";

/**
 * Smoke E2E (REA-M04-14) — auth de base + coquille du cockpit.
 *
 * Mis à jour pour la RELEASE CANDIDATE `feature/rea-master-004` : les libellés de
 * navigation reflètent le manifeste RÉEL (`config/nav.ts`). Les anciens libellés
 * « Missions » / « Swarms » ont été RETIRÉS (décision produit) et n'existent plus —
 * les asserter était un faux test. Nav réelle : Accueil, Prospection, Portefeuille,
 * Clients, Agenda, Agents, Profil.
 */

const creds = readAdminCreds();

test("racine non connecté → redirige vers /auth/login", async ({ browser }) => {
  // `AUTH_DEV_BYPASS=true` (proxy.ts, non-prod) authentifie d'office un anonyme
  // sur les routes de PAGE : la garde est alors structurellement intestable.
  // On skippe explicitement plutôt que d'asserter un comportement désactivé.
  const bypass = await isDevBypassActive();
  test.skip(bypass, "AUTH_DEV_BYPASS actif sur ce serveur — garde page désactivée par conception");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const resp = await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(resp?.status()).toBeLessThan(500);
  await ctx.close();
});

test("racine non connecté → l'API reste fermée même sous dev-bypass", async ({ request }) => {
  // Contre-preuve : quel que soit le bypass, une route API appelée sans session
  // répond 401 JSON (jamais une redirection HTML, jamais un 200 silencieux).
  const res = await request.get("/api/estimations");
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: "unauthorized" });
});

test("page login affiche le formulaire email + mot de passe", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
});

test("login avec credentials invalides → 401 invalid_credentials", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email: "nope@example.com", password: "wrongwrongwrong" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toMatchObject({ error: "invalid_credentials" });
});

test("login body invalide (pas d'email) → 400 invalid_body", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { password: "x" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toMatchObject({ error: "invalid_body" });
});

test("login avec credentials admin → 200 + cookie posé", async ({ request }) => {
  test.skip(!creds, "docs/credentials.local.txt absent");
  const res = await request.post("/api/auth/login", {
    data: { email: creds!.email, password: creds!.password },
  });
  expect(res.status()).toBe(200);
  const setCookie = res.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain("real_estate_agent_token");
});

test("cockpit connecté → rail expose la navigation réelle de la RC", async ({ page }) => {
  const ok = await loginPage(page);
  test.skip(!ok, "identifiants admin absents");

  await page.goto("/");
  // Rail gauche (desktop) : les 6 entrées du manifeste `navRail`.
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link", { name: "Accueil" }).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Prospection" }).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Portefeuille" }).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clients" }).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Agenda" }).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Agents" }).first()).toBeVisible();

  // Aucun libellé de module retiré ne doit subsister.
  await expect(page.getByRole("link", { name: "Missions" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Swarms" })).toHaveCount(0);
});

test("accueil connecté @375 → pas de scroll horizontal", async ({ page }) => {
  const ok = await loginPage(page);
  test.skip(!ok, "identifiants admin absents");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});
