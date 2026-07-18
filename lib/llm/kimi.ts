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
export function kimiIsConfigured(): boolean {
  return Boolean(process.env.MOONSHOT_API_KEY || process.env.HYPERCLI_API_KEY);
}

// Client lazy singleton : le SDK OpenAI jette DÈS LA CONSTRUCTION si `apiKey`
// est absent/vide ET `OPENAI_API_KEY` non plus (même avec apiKey: "") — un
// `export const kimi = new OpenAI(...)` au niveau module cassait donc le build
// (`next build` collecte les page data en important ce module) sur tout
// environnement sans clé Kimi/Hypercli, ex. Vercel Preview où ces clés sont
// scopées Production only. On ne construit le client qu'au premier usage réel.
let _kimi: OpenAI | null = null;

export function getKimiClient(): OpenAI {
  if (!kimiIsConfigured()) {
    throw new Error("kimi_not_configured");
  }
  if (!_kimi) {
    const moonshotKey = process.env.MOONSHOT_API_KEY;
    _kimi = new OpenAI({
      apiKey: moonshotKey || process.env.HYPERCLI_API_KEY,
      baseURL: moonshotKey
        ? process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1"
        : process.env.HYPERCLI_BASE_URL || "https://api.hypercli.com/v1",
    });
  }
  return _kimi;
}
