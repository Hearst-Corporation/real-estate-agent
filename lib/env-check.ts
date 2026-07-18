// lib/env-check.ts — Validation d'ENVIRONNEMENT AU BOOT (fail-fast, server-only).
//
// But : quand le serveur démarre en RUNTIME, il DOIT refuser de servir si une
// variable serveur *requise* est absente — avec un message clair listant les
// NOMS manquants, jamais la moindre VALEUR de secret. Un crash tardif et obscur
// (500 au premier appel DB, trois écrans plus loin) est remplacé par un échec
// explicite et immédiat au boot.
//
// Migration GPU1/PostgREST : la DB requiert `GPU1_POSTGREST_URL` +
// `GPU1_POSTGREST_ADMIN_TOKEN` (service-role serveur-only). Aucune variable DB
// publique n'est requise (le SDK client navigateur a été retiré).
//
// Appelé UNE fois depuis `instrumentation.ts#register()` (runtime nodejs).
// JAMAIS pendant `next build` : la phase de build n'a pas les secrets runtime et
// throw casserait le build. Le garde `isBuildPhase()` neutralise le throw (warn).

import { z } from "zod";

/**
 * Variables SERVEUR requises pour qu'une instance puisse servir du trafic.
 * Aucune valeur n'est stockée ni imprimée : on ne remonte QUE le nom en échec.
 */
const REQUIRED_SERVER = z.object({
  // Client PostgREST service-role (bypass RLS) — sans lui, aucune requête serveur.
  GPU1_POSTGREST_ADMIN_TOKEN: z
    .string()
    .min(20, "GPU1_POSTGREST_ADMIN_TOKEN manquant ou trop court (service-role)"),
  // URL PostgREST gpu1 — sans elle, aucune connexion DB.
  GPU1_POSTGREST_URL: z.string().url("GPU1_POSTGREST_URL manquante ou URL invalide"),
  // Signature/vérif des sessions jose custom — sans lui, aucune auth.
  JWT_SECRET: z.string().min(16, "JWT_SECRET manquante ou trop courte (< 16)"),
});

/** Phase `next build` : les env runtime peuvent manquer légitimement. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** Formate les erreurs Zod en n'exposant QUE les noms de champs + messages. */
function formatIssues(...errors: z.ZodError[]): string[] {
  const lines: string[] = [];
  for (const err of errors) {
    for (const issue of err.issues) {
      lines.push(`  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`);
    }
  }
  return lines;
}

/**
 * Vérifie l'environnement serveur au boot. Throw (fail-fast) si une var requise
 * manque, SAUF pendant `next build` où l'on se contente d'un warning. Ne renvoie
 * rien. Idempotent. N'imprime JAMAIS de valeur de secret — uniquement des noms.
 */
export function assertBootEnv(): void {
  // Ne s'applique qu'au serveur. Sur le client, il n'y a pas de secret à valider.
  if (typeof window !== "undefined") return;

  const problems: string[] = [];

  const serverParsed = REQUIRED_SERVER.safeParse({
    GPU1_POSTGREST_ADMIN_TOKEN: process.env.GPU1_POSTGREST_ADMIN_TOKEN,
    GPU1_POSTGREST_URL: process.env.GPU1_POSTGREST_URL,
    JWT_SECRET: process.env.JWT_SECRET,
  });
  if (!serverParsed.success) problems.push(...formatIssues(serverParsed.error));

  // Garde-fou prod : AUTH_DEV_BYPASS actif en production = trou d'auth béant.
  const devBypass = process.env.AUTH_DEV_BYPASS === "true" || process.env.AUTH_DEV_BYPASS === "1";
  if (devBypass && process.env.NODE_ENV === "production") {
    problems.push(
      "  - AUTH_DEV_BYPASS : =true INTERDIT avec NODE_ENV=production (bypass complet de l'auth)",
    );
  }

  if (problems.length === 0) return;

  const message =
    `[boot] Environnement serveur invalide — l'application ne peut pas démarrer :\n` +
    problems.join("\n") +
    `\nRenseigne ces variables dans .env.local (dev) ou les Environment Variables Vercel (prod). ` +
    `Voir docs/DEPLOYMENT.md §2 et docs/api-config/SERVICES.md. ` +
    `Aucune valeur de secret n'est jamais affichée.`;

  // Pendant `next build`, les env runtime peuvent manquer : on n'échoue PAS le
  // build (ce serait un faux négatif), on prévient seulement.
  if (isBuildPhase()) {
    console.warn(`${message}\n[boot] (phase build — non bloquant ; vérifié au démarrage runtime)`);
    return;
  }

  // Runtime : fail-fast. Le serveur refuse de servir sans son socle.
  throw new Error(message);
}
