import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { request as playwrightRequest } from "@playwright/test";
import { AUTH_STATE_PATH, BASE_URL, readAdminCreds } from "./_helpers";

/**
 * GLOBAL SETUP — une seule authentification pour toute la suite (REA-M04-14).
 *
 * `/api/auth/login` est protégé contre le bruteforce : 20 tentatives/60 s par IP
 * et 8/60 s par email. C'est le comportement VOULU du produit. Se connecter dans
 * chaque test dépassait ces seuils et produisait une cascade de 429, laquelle se
 * traduisait en `skip` silencieux — donc en faux vert. On centralise ici : un seul
 * login, sérialisé en `storageState`, rejoué par tous les tests.
 *
 * Si les identifiants sont absents ou si le login échoue, AUCUN état n'est écrit :
 * les parcours authentifiés se `skip` alors explicitement, jamais en faisant croire
 * qu'ils sont passés.
 *
 * L'état contient un cookie de session → il est écrit sous `test-results/`
 * (gitignoré) et n'est jamais tracké.
 */
export default async function globalSetup(): Promise<void> {
  // Repartir d'un état propre : jamais de session périmée rejouée.
  rmSync(AUTH_STATE_PATH, { force: true });

  const creds = readAdminCreds();
  if (!creds) {
    console.warn(
      "[e2e] Aucun identifiant admin (docs/credentials.local.txt) — les parcours authentifiés seront SKIPPÉS.",
    );
    return;
  }

  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    // Le rate-limit est fenêtré à 60 s : si une exécution précédente l'a consommé,
    // on attend la fenêtre plutôt que d'échouer (max 2 tentatives supplémentaires).
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await ctx.post("/api/auth/login", {
        data: { email: creds.email, password: creds.password },
      });

      if (res.status() === 429) {
        console.warn(`[e2e] login rate-limité (429) — attente de la fenêtre (essai ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, 61_000));
        continue;
      }

      if (res.status() !== 200) {
        console.warn(`[e2e] login refusé (HTTP ${res.status()}) — parcours authentifiés SKIPPÉS.`);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { mfa_required?: boolean };
      if (body?.mfa_required) {
        // Un 2e facteur valide ne peut pas être forgé sans le secret TOTP :
        // on ne simule PAS un MFA qui passe (ce serait un faux vert).
        console.warn("[e2e] MFA requis sur ce compte — parcours authentifiés SKIPPÉS.");
        return;
      }

      mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
      await ctx.storageState({ path: AUTH_STATE_PATH });
      console.log("[e2e] session admin partagée établie (1 seul login pour toute la suite).");
      return;
    }
    console.warn("[e2e] login toujours rate-limité après 3 essais — parcours authentifiés SKIPPÉS.");
  } finally {
    await ctx.dispose();
  }
}
