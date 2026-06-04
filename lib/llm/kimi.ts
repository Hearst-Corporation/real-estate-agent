import OpenAI from "openai";

/** Client Kimi K2.6 via Hypercli (OpenAI-compatible). HYPERCLI_API_KEY jamais côté client. */
export const kimi = new OpenAI({
  apiKey: process.env.HYPERCLI_API_KEY,
  baseURL: process.env.HYPERCLI_BASE_URL || "https://api.hypercli.com/v1",
});

export const KIMI_MODEL = process.env.HYPERCLI_DEFAULT_MODEL || "kimi-k2.6";

export function kimiIsConfigured(): boolean {
  return Boolean(process.env.HYPERCLI_API_KEY);
}
