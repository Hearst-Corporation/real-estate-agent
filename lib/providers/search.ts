/**
 * lib/providers/search.ts — Recherche web (Exa, Tavily, Perplexity).
 *
 * Usage immo : contexte marché, annonces concurrentes, infos quartier
 * (écoles, transports, projets urbains), tendances locales.
 *
 *   exaSearch(query)         → SearchResult[]
 *   tavilySearch(query)      → SearchResult[]
 *   perplexityAnswer(query)  → { answer, citations }
 *   *IsConfigured()          → boolean
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const SEARCH_PROVIDER_TIMEOUT_MS = 15_000;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/* ── Exa (neural search) ─────────────────────────────────────────── */

export function exaIsConfigured(): boolean {
  return envPresent("EXA_API_KEY");
}

export async function exaSearch(query: string, numResults = 5): Promise<SearchResult[]> {
  if (!exaIsConfigured()) throw new ProviderUnavailableError("exa");
  const data = await fetchJson<{ results: Array<Record<string, unknown>> }>(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.EXA_API_KEY!,
      },
      body: JSON.stringify({ query, numResults, contents: { text: true } }),
      timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
    },
  );
  return data.results.map((r) => ({
    title: (r.title as string) ?? "",
    url: (r.url as string) ?? "",
    snippet: ((r.text as string) ?? "").slice(0, 500),
  }));
}

/* ── Tavily (agentic search) ─────────────────────────────────────── */

export function tavilyIsConfigured(): boolean {
  return envPresent("TAVILY_API_KEY");
}

export async function tavilySearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  if (!tavilyIsConfigured()) throw new ProviderUnavailableError("tavily");
  const data = await fetchJson<{ results: Array<Record<string, unknown>> }>(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
      }),
      timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
    },
  );
  return data.results.map((r) => ({
    title: (r.title as string) ?? "",
    url: (r.url as string) ?? "",
    snippet: (r.content as string) ?? "",
  }));
}

/* ── Perplexity (réponse sourcée) ────────────────────────────────── */

export function perplexityIsConfigured(): boolean {
  return envPresent("PERPLEXITY_API_KEY");
}

export async function perplexityAnswer(
  query: string,
): Promise<{ answer: string; citations: string[] }> {
  if (!perplexityIsConfigured()) throw new ProviderUnavailableError("perplexity");
  const data = await fetchJson<{
    choices: Array<{ message: { content: string } }>;
    citations?: string[];
  }>("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
    timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
  });
  return {
    answer: data.choices[0]?.message.content ?? "",
    citations: data.citations ?? [],
  };
}
