/**
 * lib/agent/tools/search.ts — Outils de recherche web du chat agentique.
 *
 * Expose deux outils sourcés sur les providers de `lib/providers/search` :
 *   - search_web      : recherche web brute (Exa, fallback Tavily) → liste de résultats.
 *   - ask_perplexity  : réponse synthétique sourcée (Perplexity).
 *
 * Fail-soft : on vérifie xxxIsConfigured() AVANT d'appeler ; si aucun provider
 * n'est configuré → { ok:false } avec observation FR. try/catch autour des appels
 * réseau (ProviderUnavailableError ou erreur HTTP → { ok:false }, jamais de throw).
 * Pas d'accès DB ici → pas de filtrage tenant. Aucun secret n'est jamais exposé.
 * Schémas JSON Kimi-safe : aucun type-array, aucun oneOf.
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";
import {
  exaSearch,
  tavilySearch,
  perplexityAnswer,
  exaIsConfigured,
  tavilyIsConfigured,
  perplexityIsConfigured,
  type SearchResult,
} from "@/lib/providers/search";
import { paidCall } from "@/lib/providers/cost-guard";

// ─── Constantes (pas de magic number nu) ────────────────────────────────────────

const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 10;
const SNIPPET_MAX_LEN = 280;
const MAX_CITATIONS = 8;
const SEARCH_CACHE_TTL_S = 3600;
const EXA_DAILY_CAP = 200;
const TAVILY_DAILY_CAP = 200;
const PERPLEXITY_DAILY_CAP = 100;

// ─── Helpers (typage défensif des inputs LLM) ───────────────────────────────────

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Borne le nombre de résultats demandé entre 1 et MAX_NUM_RESULTS. */
function clampNumResults(v: unknown): number {
  const n = asNumber(v);
  if (n === undefined) return DEFAULT_NUM_RESULTS;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_NUM_RESULTS);
}

function missing(field: string): ToolResult {
  return {
    ok: false,
    summary: `Champ requis manquant : ${field}`,
    observation: `Impossible : il manque le champ requis « ${field} ». Demande-le à l'utilisateur.`,
  };
}

/** Réponse standard "aucun provider de recherche configuré". */
function notConfigured(): ToolResult {
  return {
    ok: false,
    summary: "Recherche web non configurée",
    observation:
      "Recherche web non configurée : aucun fournisseur de recherche (Exa, Tavily) n'est disponible. " +
      "Signale-le à l'utilisateur, ne fais pas semblant d'avoir cherché.",
  };
}

/** Réponse standard "provider injoignable" (erreur réseau / HTTP / clé absente). */
function providerError(label: string): ToolResult {
  return {
    ok: false,
    summary: `Échec : ${label}`,
    observation:
      `Échec de la recherche web (« ${label} ») : le fournisseur est momentanément injoignable. ` +
      "Réessaie plus tard ou signale-le à l'utilisateur.",
  };
}

/** Formate un SearchResult[] en observation FR lisible (titre — url — extrait). */
function formatResults(query: string, provider: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `Aucun résultat web pour « ${query} » (via ${provider}).`;
  }
  const lines = results
    .map((r, i) => {
      const titre = r.title.trim() || "(sans titre)";
      const snippet = r.snippet.trim().replace(/\s+/g, " ").slice(0, SNIPPET_MAX_LEN);
      const extrait = snippet ? `\n  ${snippet}` : "";
      return `${i + 1}. ${titre} — ${r.url}${extrait}`;
    })
    .join("\n");
  return `Résultats web pour « ${query} » (via ${provider}, ${results.length}) :\n${lines}`;
}

// ─── search_web (Exa → Tavily fallback) ─────────────────────────────────────────

const searchWeb: AgentTool = {
  name: "search_web",
  description:
    "Recherche des informations sur le web (annonces concurrentes, prix au m², tendances de marché, " +
    "infos quartier : écoles, transports, projets urbains). Renvoie une liste de résultats " +
    "(titre, url, extrait). Utilise-le quand l'utilisateur a besoin de données externes/à jour " +
    "que le CRM ne contient pas. Route Exa en priorité, repli automatique sur Tavily.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Requête de recherche en langage naturel (obligatoire). Ex: « prix m² appartement Paris 11e 2026 ».",
      },
      num_results: {
        type: "number",
        description: `Nombre max de résultats (défaut ${DEFAULT_NUM_RESULTS}, max ${MAX_NUM_RESULTS}).`,
      },
    },
    required: ["query"],
  },
  async execute(args): Promise<ToolResult> {
    const query = asString(args.query);
    if (!query) return missing("query");

    const numResults = clampNumResults(args.num_results);
    const exaOk = exaIsConfigured();
    const tavilyOk = tavilyIsConfigured();

    if (!exaOk && !tavilyOk) return notConfigured();

    // Exa en priorité.
    if (exaOk) {
      try {
        const exaRes = await paidCall("exa", `web:${query}:${numResults}`, () => exaSearch(query, numResults), { ttlSec: SEARCH_CACHE_TTL_S, dailyCap: EXA_DAILY_CAP });
        if (exaRes.ok) {
          return {
            ok: true,
            summary: `Recherche web : ${exaRes.data.length} résultat(s)`,
            observation: formatResults(query, "Exa", exaRes.data),
          };
        }
        // cost-guard a refusé l'appel → repli sur Tavily si disponible, sinon erreur.
        if (!tavilyOk) return providerError("recherche Exa");
      } catch {
        // Repli sur Tavily si disponible, sinon erreur.
        if (!tavilyOk) return providerError("recherche Exa");
      }
    }

    // Tavily (fallback, ou seul provider configuré).
    try {
      const tavilyRes = await paidCall("tavily", `web:${query}:${numResults}`, () => tavilySearch(query, numResults), { ttlSec: SEARCH_CACHE_TTL_S, dailyCap: TAVILY_DAILY_CAP });
      if (tavilyRes.ok) {
        return {
          ok: true,
          summary: `Recherche web : ${tavilyRes.data.length} résultat(s)`,
          observation: formatResults(query, "Tavily", tavilyRes.data),
        };
      }
      return providerError("recherche Tavily");
    } catch {
      return providerError("recherche Tavily");
    }
  },
};

// ─── ask_perplexity (réponse sourcée) ───────────────────────────────────────────

const askPerplexity: AgentTool = {
  name: "ask_perplexity",
  description:
    "Pose une question au web et obtient une RÉPONSE synthétique sourcée (avec citations), " +
    "plutôt qu'une liste de liens. Idéal pour une question factuelle sur le marché immobilier " +
    "(prix au m² d'un quartier, tendance d'un secteur, réglementation locale). Préfère search_web " +
    "quand l'utilisateur veut explorer/comparer des annonces ; préfère ask_perplexity pour une " +
    "réponse directe et argumentée.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Question en langage naturel (obligatoire). Ex: « Quel est le prix moyen au m² à Lyon 6e en 2026 ? ».",
      },
    },
    required: ["query"],
  },
  async execute(args): Promise<ToolResult> {
    const query = asString(args.query);
    if (!query) return missing("query");

    if (!perplexityIsConfigured()) {
      return {
        ok: false,
        summary: "Recherche web non configurée",
        observation:
          "Recherche web non configurée : le fournisseur de réponses sourcées (Perplexity) n'est pas disponible. " +
          "Essaie search_web si configuré, sinon signale-le à l'utilisateur.",
      };
    }

    try {
      const ppxRes = await paidCall("perplexity", `ask:${query}`, () => perplexityAnswer(query), { ttlSec: SEARCH_CACHE_TTL_S, dailyCap: PERPLEXITY_DAILY_CAP });
      if (!ppxRes.ok) return providerError("réponse Perplexity");
      const { answer, citations } = ppxRes.data;
      const trimmed = answer.trim();
      if (!trimmed) {
        return {
          ok: false,
          summary: "Réponse vide",
          observation: `Aucune réponse exploitable pour « ${query} ». Réessaie ou reformule.`,
        };
      }
      const sources =
        citations.length > 0
          ? `\n\nSources :\n${citations
              .slice(0, MAX_CITATIONS)
              .map((c, i) => `${i + 1}. ${c}`)
              .join("\n")}`
          : "";
      return {
        ok: true,
        summary: "Réponse web sourcée",
        observation: `Réponse à « ${query} » :\n${trimmed}${sources}`,
      };
    } catch {
      return providerError("réponse Perplexity");
    }
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────────

export const searchTools: AgentTool[] = [searchWeb, askPerplexity];
