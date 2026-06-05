/**
 * lib/market/context.ts — Helpers purs du contexte marché (A6).
 *
 * Normalise les sorties hétérogènes des providers de recherche vers un format
 * unifié { summary, citations: {title,url}[] }. AUCUN IO, AUCUN calcul de prix.
 */

import type { SearchResult } from "@/lib/providers/search";

export type Citation = { title: string; url: string };

const SUMMARY_SNIPPETS = 3;
const SUMMARY_MAX = 1200;

export function buildMarketQuery(input: {
  property_type: string | null;
  city: string | null;
  postal_code: string | null;
}): string {
  const type = input.property_type ?? "bien immobilier";
  const loc = [input.city, input.postal_code].filter(Boolean).join(" ");
  return `Marché immobilier ${type} à ${loc} : prix au m², tendances récentes, attractivité du quartier (transports, écoles, projets urbains).`;
}

/** Résumé à partir des snippets (Exa/Tavily) — null si rien d'exploitable. */
export function summarizeResults(results: SearchResult[]): string | null {
  const parts = results
    .slice(0, SUMMARY_SNIPPETS)
    .map((r) => r.snippet?.trim())
    .filter((s): s is string => Boolean(s));
  if (parts.length === 0) return null;
  return parts.join("\n\n").slice(0, SUMMARY_MAX);
}

/** Exa/Tavily SearchResult[] → citations {title,url} (title garanti non vide). */
export function toCitations(results: SearchResult[], max: number): Citation[] {
  return results
    .filter((r) => r.url)
    .slice(0, max)
    .map((r) => ({ title: r.title || r.url, url: r.url }));
}

/** Perplexity renvoie des URLs nues (string[]) → on les normalise en {title,url}. */
export function perplexityCitations(urls: string[], max: number): Citation[] {
  return urls
    .filter(Boolean)
    .slice(0, max)
    .map((u) => ({ title: u, url: u }));
}
