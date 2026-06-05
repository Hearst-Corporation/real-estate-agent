/**
 * lib/providers/embeddings.ts — Embeddings OpenAI (text-embedding-3-small, 1536d).
 *
 * Usage immo : vectoriser les biens/comparables pour du matching sémantique
 * (retrouver des ventes similaires au-delà du simple filtre prix/surface).
 *
 *   embeddingsIsConfigured()   → boolean
 *   embed(text)                → number[] (1536d)
 *   embedBatch(texts)          → number[][]
 */

import OpenAI from "openai";
import { ProviderUnavailableError, envPresent } from "./types";

const MODEL = "text-embedding-3-small";

let client: OpenAI | null | undefined;

export function embeddingsIsConfigured(): boolean {
  return envPresent("OPENAI_API_KEY");
}

function getClient(): OpenAI | null {
  if (client !== undefined) return client;
  client = embeddingsIsConfigured()
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  return client;
}

export async function embed(text: string): Promise<number[]> {
  const c = getClient();
  if (!c) throw new ProviderUnavailableError("embeddings");
  const res = await c.embeddings.create({ model: MODEL, input: text });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const c = getClient();
  if (!c) throw new ProviderUnavailableError("embeddings");
  if (texts.length === 0) return [];
  const res = await c.embeddings.create({ model: MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}
