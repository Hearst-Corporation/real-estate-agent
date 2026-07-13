// lib/env.ts — Config env typée & validée (Supabase privé gpu1 + JWT + Redis).
//
// But : un point unique, typé, qui REFUSE de démarrer si une var SERVEUR requise
// manque, avec un message clair — et SANS jamais imprimer la moindre valeur de
// secret. N'importe PAS "server-only" au top-level pour rester importable partout ;
// l'accès aux secrets serveur est gated par un garde runtime (throw si browser).
//
// Usage :
//   import { serverEnv } from "@/lib/env";
//   const { supabaseUrl, serviceRoleKey } = serverEnv();   // serveur uniquement
//   import { publicEnv } from "@/lib/env";
//   const { supabaseUrl, anonKey } = publicEnv();          // partout (public)
//
// Additif et non-cassant : le reste du code peut continuer à lire process.env.
// Ce module ne remplace rien de force ; il offre une façade validée à adopter.
import { z } from "zod";

// ── Coercitions ──────────────────────────────────────────────────────────────
const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : v === "true" || v === "1"));

// ── Schéma PUBLIC (safe côté navigateur) ─────────────────────────────────────
const PublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url({ message: "NEXT_PUBLIC_SUPABASE_URL doit être une URL valide" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY manquante ou trop courte"),
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: z.string().optional(),
});

// ── Schéma SERVEUR (secrets — jamais côté client) ────────────────────────────
const ServerSchema = z.object({
  // Supabase privé (self-hosté gpu1). SUPABASE_URL peut retomber sur la publique.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY requise (service-role bypass RLS)"),
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),
  // Auth JWT jose custom — REQUISE pour signer/vérifier les sessions.
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

type PublicEnv = z.infer<typeof PublicSchema>;
type ServerEnv = z.infer<typeof ServerSchema>;

let _public: PublicEnv | null = null;
let _server: ServerEnv | null = null;

function fail(scope: string, err: z.ZodError): never {
  // On n'imprime QUE les noms de champs et leurs messages — jamais les valeurs.
  const lines = err.issues.map((i) => `  - ${i.path.join(".") || "(racine)"} : ${i.message}`);
  throw new Error(
    `[env] Configuration ${scope} invalide :\n${lines.join("\n")}\n` +
      `Renseigne ces variables dans .env.local (voir docs/api-config/SERVICES.md).`,
  );
}

/** Config publique validée — importable/appelable partout (client & serveur). */
export function publicEnv(): PublicEnv {
  if (_public) return _public;
  const parsed = PublicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  });
  if (!parsed.success) fail("publique", parsed.error);
  _public = parsed.data;
  return _public;
}

/**
 * Config serveur validée (secrets). REFUSE l'appel côté navigateur et throw si
 * une var requise manque. À appeler dans du code serveur (route handlers, jobs).
 */
export function serverEnv(): ServerEnv & {
  supabaseUrl: string;
  serviceRoleKey: string;
  redisUrl: string | null;
} {
  if (typeof window !== "undefined") {
    throw new Error("[env] serverEnv() appelé côté client — interdit (fuite de secrets).");
  }
  if (!_server) {
    const parsed = ServerSchema.safeParse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
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
  const supabaseUrl = _server.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const redisUrl = _server.REDIS_URL || _server.UPSTASH_REDIS_REST_URL || null;
  return { ..._server, supabaseUrl, serviceRoleKey: _server.SUPABASE_SERVICE_ROLE_KEY, redisUrl };
}

/** Validation explicite au boot (ex: instrumentation.ts). Ne renvoie rien, throw si KO. */
export function assertEnv(): void {
  publicEnv();
  if (typeof window === "undefined") serverEnv();
}
