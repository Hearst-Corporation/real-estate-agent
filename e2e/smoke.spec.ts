import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

function readAdminCreds(): { email: string; password: string } | null {
  try {
    const raw = readFileSync("docs/credentials.local.txt", "utf8");
    const email = raw.match(/^ADMIN_EMAIL=(.+)$/m)?.[1]?.trim();
    const password = raw.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
    if (email && password) return { email, password };
  } catch {
    /* noop */
  }
  return null;
}

test("racine non connecté → redirige vers /auth/login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("page login affiche le formulaire email + mot de passe", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
});

test("login avec credentials invalides → 401", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email: "nope@example.com", password: "wrongwrongwrong" },
  });
  expect(res.status()).toBe(401);
});

test("login avec credentials admin → 200 + cookie posé", async ({ request }) => {
  const creds = readAdminCreds();
  test.skip(!creds, "docs/credentials.local.txt absent");
  const res = await request.post("/api/auth/login", {
    data: { email: creds!.email, password: creds!.password },
  });
  expect(res.status()).toBe(200);
  const setCookie = res.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain("real_estate_agent_token");
});

test("mobile connecté → bottom bar expose les raccourcis cockpit", async ({ page }) => {
  const creds = readAdminCreds();
  test.skip(!creds, "docs/credentials.local.txt absent");

  await page.setViewportSize({ width: 390, height: 844 });
  const res = await page.context().request.post("/api/auth/login", {
    data: { email: creds!.email, password: creds!.password },
  });
  expect(res.status()).toBe(200);

  await page.goto("/");
  const bottomBar = page.locator(".ct-bottom-bar");
  await expect(bottomBar).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Missions" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Estimations" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Prospection" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "CRM" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Swarms" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Profil" })).toBeVisible();
});
