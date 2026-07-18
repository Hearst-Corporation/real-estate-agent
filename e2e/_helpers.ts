import { existsSync, readFileSync } from "node:fs";
import {
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/** Cookies tels que sérialisés par `storageState` (contrat `addCookies`). */
type StoredCookies = Parameters<BrowserContext["addCookies"]>[0];

/**
 * Helpers partagés des specs E2E (REA-M04-14).
 *
 * Objectif : specs déterministes et honnêtes. Rien n'est inventé — quand un
 * pré-requis manque (identifiants admin, `.env.local`), le parcours se `skip`.
 * Aucune donnée PII : les fixtures utilisent des marqueurs `[E2E]`, des emails
 * `@example.com` et des numéros `06 00 00 00 0X`.
 */

export const BASE_URL = "http://localhost:3002";

/** Racine du repo principal (les secrets/creds vivent là, pas dans le worktree). */
const REPO_ROOT = "/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent";

/**
 * Session admin partagée, produite UNE SEULE FOIS par `global-setup.ts`.
 *
 * POURQUOI : `/api/auth/login` est rate-limité (20/60s par IP, 8/60s par email —
 * anti-bruteforce voulu et correct). Se connecter dans chaque test faisait
 * exploser ces barrières → cascade de 429 et de faux `skip`. On se connecte donc
 * une fois, on sérialise l'état, et chaque test le REJOUE sans retaper le login.
 *
 * Le fichier vit sous `test-results/` (gitignoré) : il contient un cookie de
 * session, il ne doit JAMAIS être tracké.
 */
export const AUTH_STATE_PATH = "test-results/e2e-auth-state.json";

/** Vrai si la session admin partagée est disponible (sinon : skip honnête). */
export function hasAuthState(): boolean {
  return existsSync(AUTH_STATE_PATH);
}

/**
 * Détecte si `AUTH_DEV_BYPASS` est actif sur le serveur observé.
 *
 * Le bypass (proxy.ts, non-prod uniquement) authentifie d'office un anonyme sur
 * les routes de PAGE. La garde « anonyme → /auth/login » est donc structurellement
 * intestable tant qu'il est actif : on skippe alors ce test au lieu de mentir.
 */
export async function isDevBypassActive(): Promise<boolean> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const res = await ctx.get("/", { maxRedirects: 0 });
    // Bypass actif → 200 direct. Sinon → redirection (30x) vers /auth/login.
    return res.status() === 200;
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

export type AdminCreds = { email: string; password: string };

/**
 * Lit les identifiants admin depuis `docs/credentials.local.txt` (gitignored).
 * Cherche d'abord le worktree, puis le repo principal. Renvoie `null` si absent
 * → le parcours concerné se `skip` (jamais de faux vert, jamais de secret dur).
 */
export function readAdminCreds(): AdminCreds | null {
  const paths = [
    "docs/credentials.local.txt",
    `${REPO_ROOT}/docs/credentials.local.txt`,
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      const email = raw.match(/^ADMIN_EMAIL=(.+)$/m)?.[1]?.trim();
      const password = raw.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
      if (email && password) return { email, password };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Parse un `.env.local` minimal (même logique que seed-crm.mjs). */
export function loadEnv(): Record<string, string> {
  const paths = [".env.local", `${REPO_ROOT}/.env.local`];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      const env: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
      return env;
    } catch {
      /* next */
    }
  }
  return {};
}

/**
 * Ouvre un contexte API authentifié en REJOUANT la session partagée.
 * Aucun appel à `/api/auth/login` ici — c'est ce qui déclenchait les 429.
 * Renvoie `null` si la session partagée est absente → le parcours se `skip`.
 */
export async function loginAdminContext(): Promise<APIRequestContext | null> {
  if (!hasAuthState()) return null;
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: AUTH_STATE_PATH,
  });
}

/**
 * Authentifie une `Page` en injectant les cookies de la session partagée dans son
 * contexte navigateur. Renvoie `false` si la session est absente → skip honnête.
 *
 * On pose un VRAI cookie de session (et non le dev-bypass) pour rester proche du
 * comportement prod.
 */
export async function loginPage(page: Page): Promise<boolean> {
  if (!hasAuthState()) return false;
  try {
    const state = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8")) as {
      cookies?: StoredCookies;
    };
    const cookies: StoredCookies = state.cookies ?? [];
    if (cookies.length === 0) return false;
    await page.context().addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

/** Vrai s'il n'y a aucun scroll horizontal du body (charte : jamais de h-scroll). */
export async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}
