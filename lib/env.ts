// lib/env.ts — Config env typée & validée (DB PostgREST gpu1 + JWT + Redis).
//
// But : un point unique, typé, qui REFUSE de démarrer si une var SERVEUR requise
// manque, avec un message clair — et SANS jamais imprimer la moindre valeur de
// secret. N'importe PAS "server-only" au top-level pour rester importable partout ;
// l'accès aux secrets serveur est gated par un garde runtime (throw si browser).
//
// Migration GPU1/PostgREST : la DB est un Postgres self-hosté gpu1 exposé par
// PostgREST. Le client serveur utilise `GPU1_POSTGREST_URL` +
// `GPU1_POSTGREST_ADMIN_TOKEN` (service-role, bypass RLS). Aucun consommateur
// navigateur réel de la DB n'existe (le SDK client a été retiré) → aucune
// variable DB publique (`NEXT_PUBLIC_*`) n'est requise.
//
// Usage :
//   import { serverEnv } from "@/lib/env";
//   const { postgrestUrl, adminToken } = serverEnv();   // serveur uniquement
import { z } from "zod";

// ── Coercitions ──────────────────────────────────────────────────────────────
const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : v === "true" || v === "1"));

// ── Schéma SERVEUR (secrets — jamais côté client) ────────────────────────────
const ServerSchema = z.object({
  // DB PostgREST gpu1 (self-hosté). URL + token service-role (bypass RLS).
  GPU1_POSTGREST_URL: z
    .string()
    .url({ message: "GPU1_POSTGREST_URL doit être une URL PostgREST valide" }),
  GPU1_POSTGREST_ADMIN_TOKEN: z
    .string()
    .min(20, "GPU1_POSTGREST_ADMIN_TOKEN requis (service-role bypass RLS)"),
  GPU1_POSTGREST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Auth JWT jose custom — REQUISE pour signer/vérifier les sessions applicatives.
  // À ne PAS confondre avec le JWT PostgREST (GPU1_POSTGREST_ADMIN_TOKEN).
  JWT_SECRET: z.string().min(16, "JWT_SECRET requise (signature des sessions jose)"),
  // Flags auth. AUTH_DEV_BYPASS DOIT être false hors dev.
  AUTH_DEV_BYPASS: boolish(false),
  AUTH_CHECK_REVOCATION: boolish(false),
  // Redis : soit Upstash REST (runtime serverless), soit REDIS_URL (Railway).
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // LLM chat Cockpit — OpenAI. OPTIONNEL : le chat dégrade proprement si absent,
  // ne bloque jamais le boot. Les modèles ont un défaut applicatif si non fournis.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().optional(),
  OPENAI_CHAT_FALLBACK_MODEL: z.string().optional(),
  OPENAI_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
});

type ServerEnv = z.infer<typeof ServerSchema>;

let _server: ServerEnv | null = null;

function fail(scope: string, err: z.ZodError): never {
  // On n'imprime QUE les noms de champs et leurs messages — jamais les valeurs.
  const lines = err.issues.map((i) => `  - ${i.path.join(".") || "(racine)"} : ${i.message}`);
  throw new Error(
    `[env] Configuration ${scope} invalide :\n${lines.join("\n")}\n` +
      `Renseigne ces variables dans .env.local (voir docs/api-config/SERVICES.md).`,
  );
}

/**
 * Config serveur validée (secrets). REFUSE l'appel côté navigateur et throw si
 * une var requise manque. À appeler dans du code serveur (route handlers, jobs).
 */
export function serverEnv(): ServerEnv & {
  postgrestUrl: string;
  adminToken: string;
  redisUrl: string | null;
} {
  if (typeof window !== "undefined") {
    throw new Error("[env] serverEnv() appelé côté client — interdit (fuite de secrets).");
  }
  if (!_server) {
    const parsed = ServerSchema.safeParse({
      GPU1_POSTGREST_URL: process.env.GPU1_POSTGREST_URL,
      GPU1_POSTGREST_ADMIN_TOKEN: process.env.GPU1_POSTGREST_ADMIN_TOKEN,
      GPU1_POSTGREST_TIMEOUT_MS: process.env.GPU1_POSTGREST_TIMEOUT_MS,
      JWT_SECRET: process.env.JWT_SECRET,
      AUTH_DEV_BYPASS: process.env.AUTH_DEV_BYPASS,
      AUTH_CHECK_REVOCATION: process.env.AUTH_CHECK_REVOCATION,
      REDIS_URL: process.env.REDIS_URL,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL,
      OPENAI_CHAT_FALLBACK_MODEL: process.env.OPENAI_CHAT_FALLBACK_MODEL,
      OPENAI_CHAT_TIMEOUT_MS: process.env.OPENAI_CHAT_TIMEOUT_MS,
    });
    if (!parsed.success) fail("serveur", parsed.error);
    _server = parsed.data;
    // Garde-fou prod : AUTH_DEV_BYPASS actif en production = trou d'auth béant.
    if (_server.AUTH_DEV_BYPASS && process.env.NODE_ENV === "production") {
      throw new Error(
        "[env] AUTH_DEV_BYPASS=true en production — interdit (bypass complet de l'auth).",
      );
    }
  }
  const redisUrl = _server.REDIS_URL || _server.UPSTASH_REDIS_REST_URL || null;
  return {
    ..._server,
    postgrestUrl: _server.GPU1_POSTGREST_URL,
    adminToken: _server.GPU1_POSTGREST_ADMIN_TOKEN,
    redisUrl,
  };
}

/** Validation explicite au boot (ex: instrumentation.ts). Ne renvoie rien, throw si KO. */
export function assertEnv(): void {
  if (typeof window === "undefined") serverEnv();
}

/** Réinitialise le cache (tests only). */
export function __resetEnvForTests(): void {
  _server = null;
}
