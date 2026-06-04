import OpenAI from "openai";

/**
 * Client Kimi K2.6.
 * Provider par défaut : Moonshot AI (éditeur officiel de Kimi, API OpenAI-compatible).
 * Fallback : Hypercli (si MOONSHOT_API_KEY absent). Clé jamais exposée côté client.
 *
 * kimi-k2.6 est un modèle à raisonnement : le « thinking » arrive dans
 * `delta.reasoning_content` (champ séparé), la réponse dans `delta.content`.
 * Côté route, on ne stream que `delta.content`.
 */
const MOONSHOT_KEY = process.env.MOONSHOT_API_KEY;

export const kimi = new OpenAI({
  apiKey: MOONSHOT_KEY || process.env.HYPERCLI_API_KEY,
  baseURL: MOONSHOT_KEY
    ? process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1"
    : process.env.HYPERCLI_BASE_URL || "https://api.hypercli.com/v1",
});

export const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.6";

export function kimiIsConfigured(): boolean {
  return Boolean(MOONSHOT_KEY || process.env.HYPERCLI_API_KEY);
}
