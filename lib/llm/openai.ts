/**
 * lib/llm/openai.ts — Client OpenAI serveur du chat Cockpit.
 *
 * Client officiel `openai` (drop-in), lu UNIQUEMENT côté serveur : la clé
 * `OPENAI_API_KEY` ne transite JAMAIS par un `NEXT_PUBLIC_*`. Modèle, fallback
 * et timeout sont configurables par variable d'environnement.
 *
 * Modèles configurables :
 *  - OPENAI_CHAT_MODEL          (défaut gpt-5.4)      — modèle principal
 *  - OPENAI_CHAT_FALLBACK_MODEL (défaut gpt-5.4-mini) — repli si le principal échoue
 *  - OPENAI_CHAT_TIMEOUT_MS     (défaut 45000)        — timeout par appel
 *
 * Aucune clé/secret n'est jamais logguée : `normalizeOpenAiError` ne renvoie
 * qu'un code d'erreur normalisé, jamais le message brut du provider ni la clé.
 */

import OpenAI from "openai";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Modèle par défaut — PROUVÉ disponible sur le compte. */
const DEFAULT_CHAT_MODEL = "gpt-5.4";
/** Modèle de repli si le principal échoue (indispo / rate-limit ponctuel). */
const DEFAULT_FALLBACK_MODEL = "gpt-5.4-mini";
/** Timeout par appel LLM (ms). */
const DEFAULT_TIMEOUT_MS = 45_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
export const OPENAI_CHAT_FALLBACK_MODEL = process.env.OPENAI_CHAT_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
export const OPENAI_CHAT_TIMEOUT_MS = envInt("OPENAI_CHAT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

/** Vrai si la clé OpenAI est présente (côté serveur uniquement). */
export function openaiIsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// ─── Client (lazy singleton) ─────────────────────────────────────────────────

let _client: OpenAI | null = null;

/**
 * Renvoie le client OpenAI serveur. Le timeout intégré du SDK arme un
 * AbortController interne ; on l'aligne sur OPENAI_CHAT_TIMEOUT_MS.
 * Jette `OpenAiError("missing_key")` si la clé est absente (fail-closed).
 */
export function getOpenAiClient(): OpenAI {
  if (!openaiIsConfigured()) {
    throw new OpenAiError("missing_key");
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_CHAT_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return _client;
}

// ─── Normalisation des erreurs ───────────────────────────────────────────────

/**
 * Codes d'erreur normalisés, exposables sans fuite. On ne renvoie JAMAIS le
 * message brut du provider (peut contenir des détails d'infra), ni la clé.
 */
export type OpenAiErrorCode =
  | "missing_key"
  | "invalid_key"
  | "quota"
  | "rate_limit"
  | "model_unavailable"
  | "timeout"
  | "aborted"
  | "unknown";

export class OpenAiError extends Error {
  readonly code: OpenAiErrorCode;
  constructor(code: OpenAiErrorCode) {
    super(code);
    this.name = "OpenAiError";
    this.code = code;
  }
}

/** Message FR court, sûr à exposer au client (aucune donnée sensible). */
export function openAiErrorMessage(code: OpenAiErrorCode): string {
  switch (code) {
    case "missing_key":
      return "L'assistant IA n'est pas configuré.";
    case "invalid_key":
      return "L'assistant IA n'est pas correctement configuré.";
    case "quota":
      return "Le quota de l'assistant IA est épuisé. Réessaie plus tard.";
    case "rate_limit":
      return "L'assistant IA est temporairement saturé. Réessaie dans un instant.";
    case "model_unavailable":
      return "Le modèle de l'assistant IA est indisponible.";
    case "timeout":
      return "L'assistant IA a mis trop de temps à répondre.";
    case "aborted":
      return "Génération interrompue.";
    default:
      return "L'assistant IA a rencontré une erreur.";
  }
}

/**
 * Normalise n'importe quelle erreur (SDK OpenAI, réseau, abort) en un
 * `OpenAiError` à code stable. N'inspecte que le status/name/code — jamais
 * pour re-logger un secret.
 */
export function normalizeOpenAiError(err: unknown): OpenAiError {
  if (err instanceof OpenAiError) return err;

  // Abort explicite (annulation client) ou timeout du SDK.
  if (err instanceof Error) {
    if (err.name === "AbortError") return new OpenAiError("aborted");
    if (err.name === "APIConnectionTimeoutError" || err.name === "TimeoutError") {
      return new OpenAiError("timeout");
    }
  }

  // Erreurs SDK OpenAI : porteuses d'un `status` HTTP.
  const status = (err as { status?: number } | undefined)?.status;
  if (typeof status === "number") {
    if (status === 401 || status === 403) return new OpenAiError("invalid_key");
    if (status === 429) {
      // Distingue quota épuisé (insufficient_quota) d'un simple rate-limit.
      const type = (err as { code?: string; error?: { type?: string } }).code
        ?? (err as { error?: { type?: string } }).error?.type;
      return new OpenAiError(type === "insufficient_quota" ? "quota" : "rate_limit");
    }
    if (status === 404) return new OpenAiError("model_unavailable");
  }

  return new OpenAiError("unknown");
}

/** Vrai si l'erreur justifie un retry sur le modèle de repli. */
export function shouldFallback(code: OpenAiErrorCode): boolean {
  return code === "model_unavailable" || code === "rate_limit" || code === "timeout";
}
