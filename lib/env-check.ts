// lib/env-check.ts — Validation d'ENVIRONNEMENT AU BOOT (fail-fast, server-only).
//
// But : quand le serveur démarre en RUNTIME, il DOIT refuser de servir si une
// variable serveur *requise* est absente — avec un message clair listant les
// NOMS manquants, jamais la moindre VALEUR de secret. Un crash tardif et obscur
// (500 au premier appel DB, trois écrans plus loin) est remplacé par un échec
// explicite et immédiat au boot.
//
// Distinct de `lib/env.ts` (façade typée `serverEnv()/publicEnv()` à adopter par
// le code métier) : ce module-ci n'expose AUCUNE valeur, il ne fait que *garder*
// le démarrage. Il s'appuie sur `assertEnv()` de `lib/env.ts` s'il est présent,
// et retombe sur une vérification autonome sinon — pour ne jamais dépendre d'un
// détail d'implémentation d'un autre module.
//
// Appelé UNE fois depuis `instrumentation.ts#register()` (runtime nodejs).
// JAMAIS pendant `next build` : la phase de build n'a pas les secrets runtime et
// throw casserait le build (Vercel injecte les env au runtime, pas forcément au
// build). Le garde `isBuildPhase()` neutralise le throw dans ce cas (warn seul).

import { z } from "zod";

/**
 * Variables SERVEUR requises pour qu'une instance puisse servir du trafic.
 * Chaque entrée = nom d'env + prédicat de validité. Aucune valeur n'est stockée
 * ni imprimée : on ne remonte QUE le nom en cas d'échec.
 */
const REQUIRED_SERVER = z.object({
  // Client Postgres service-role (bypass RLS) — sans lui, aucune requête serveur.
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY manquante ou trop courte (service-role)"),
  // Signature/vérif des sessions jose custom — sans lui, aucune auth.
  JWT_SECRET: z.string().min(16, "JWT_SECRET manquante ou trop courte (< 16)"),
  // URL Postgres/PostgREST : la privée (SUPABASE_URL) ou, à défaut, la publique.
  // On accepte l'une OU l'autre → validée hors schéma (voir plus bas).
});

/**
 * Variables PUBLIQUES requises (exposées au client, donc NON secrètes) — sans
 * elles, le front ne peut pas se câbler à la DB.
 */
const REQUIRED_PUBLIC = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL manquante ou URL invalide"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY manquante ou trop courte"),
});

/** Phase `next build` : les env runtime peuvent manquer légitimement. */
function isBuildPhase(): boolean {
  // Next pose NEXT_PHASE=phase-production-build pendant `next build`.
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
 * manque, SAUF pendant `next build` où l'on se contente d'un warning (les env
 * runtime ne sont pas garantis présents au build). Ne renvoie rien.
 *
 * Idempotent et bon marché : peut être appelé plusieurs fois sans effet de bord.
 * N'imprime JAMAIS de valeur de secret — uniquement des noms de variables.
 */
export function assertBootEnv(): void {
  // Ne s'applique qu'au serveur. Sur le client, il n'y a pas de secret à valider.
  if (typeof window !== "undefined") return;

  const problems: string[] = [];

  const serverParsed = REQUIRED_SERVER.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
  });
  if (!serverParsed.success) problems.push(...formatIssues(serverParsed.error));

  const publicParsed = REQUIRED_PUBLIC.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!publicParsed.success) problems.push(...formatIssues(publicParsed.error));

  // URL DB serveur : SUPABASE_URL (privée) OU NEXT_PUBLIC_SUPABASE_URL (fallback).
  // Au moins l'une des deux doit être une URL exploitable.
  const dbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!dbUrl || !/^https?:\/\//.test(dbUrl)) {
    problems.push(
      "  - SUPABASE_URL : aucune URL DB serveur exploitable (ni SUPABASE_URL ni NEXT_PUBLIC_SUPABASE_URL)",
    );
  }

  // Garde-fou prod : AUTH_DEV_BYPASS actif en production = trou d'auth béant.
  // Bypasse toute la garde du proxy → jamais toléré hors dev, même au build.
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
