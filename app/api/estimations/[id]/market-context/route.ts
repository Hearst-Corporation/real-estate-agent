/**
 * POST /api/estimations/[id]/market-context
 *
 * Contexte marché/quartier (lecture seule, HORS calcul de prix) via recherche web.
 * - 401 si non authentifié · 503 si Supabase non configuré · 404 si non possédée
 * - Réponse : { summary: string | null, citations: {title,url}[], provider, reason? }
 *
 * Garde-fous coût (cf lib/providers/cost-guard) :
 *   - POST (jamais préfetché), rate-limit par user
 *   - paidCall fail-closed : cache par zone (48 h) + cap quotidien par provider
 *   - 1 provider primaire (Exa → Tavily), fallback sur ERREUR seule
 *   - Perplexity JAMAIS en auto (coûteux) : opt-in explicite via { deep: true }
 */

import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { rateLimit } from "@/lib/ratelimit";
import { paidCall } from "@/lib/providers/cost-guard";
import {
  exaIsConfigured,
  exaSearch,
  tavilyIsConfigured,
  tavilySearch,
  perplexityIsConfigured,
  perplexityAnswer,
  type SearchResult,
} from "@/lib/providers/search";
import {
  buildMarketQuery,
  summarizeResults,
  toCitations,
  perplexityCitations,
  type Citation,
} from "@/lib/market/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 5;
const CACHE_TTL_SEC = 172_800; // 48 h
const DAILY_CAP = 50;
const RL_LIMIT = 10;
const RL_WINDOW_SEC = 60;

const BodySchema = z.object({ deep: z.boolean().optional() }).optional();

export type MarketContext = {
  summary: string | null;
  citations: Citation[];
  provider: string | null;
  reason?: string;
};

function enabled(): boolean {
  // Désactivable par env ; sinon actif (le cost-guard fail-closed reste le filet).
  return process.env.MARKET_INTEL_ENABLED !== "false";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const claims = await getSession();
  if (!claims) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  const allowed = await rateLimit(`market:${userId}`, RL_LIMIT, RL_WINDOW_SEC);
  if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429 });

  const row = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  if (!row.city) {
    const empty: MarketContext = { summary: null, citations: [], provider: null, reason: "no_location" };
    return Response.json(empty);
  }

  const body = BodySchema.parse(await req.json().catch(() => undefined));
  const deep = body?.deep === true;
  const query = buildMarketQuery(row);
  const zoneKey = `${row.property_type ?? "x"}:${row.postal_code ?? row.city}${deep ? ":deep" : ""}`;

  // ── Perplexity : opt-in explicite uniquement (jamais auto) ──────────────────
  if (deep && perplexityIsConfigured()) {
    const r = await paidCall<MarketContext>(
      "perplexity",
      zoneKey,
      async () => {
        const ans = await perplexityAnswer(query);
        return {
          summary: ans.answer || null,
          // Perplexity renvoie des URLs nues → on normalise en {title,url}.
          citations: perplexityCitations(ans.citations, MAX_RESULTS),
          provider: "perplexity",
        };
      },
      { ttlSec: CACHE_TTL_SEC, dailyCap: DAILY_CAP, enabled: enabled() },
    );
    if (r.ok) return Response.json(r.data);
    const refused: MarketContext = { summary: null, citations: [], provider: null, reason: r.reason };
    return Response.json(refused);
  }

  // ── Primaire Exa → fallback Tavily (sur ERREUR seule, pas sur résultat vide) ─
  const primary: { name: string; run: () => Promise<SearchResult[]> } | null = exaIsConfigured()
    ? { name: "exa", run: () => exaSearch(query, MAX_RESULTS) }
    : tavilyIsConfigured()
      ? { name: "tavily", run: () => tavilySearch(query, MAX_RESULTS) }
      : null;

  if (!primary) {
    const empty: MarketContext = { summary: null, citations: [], provider: null, reason: "no_provider" };
    return Response.json(empty);
  }

  const result = await paidCall<MarketContext>(
    primary.name,
    zoneKey,
    async () => {
      let results: SearchResult[];
      try {
        results = await primary.run();
      } catch {
        // fallback sur erreur uniquement (réseau/quota), pas sur liste vide
        if (primary.name === "exa" && tavilyIsConfigured()) {
          results = await tavilySearch(query, MAX_RESULTS);
        } else {
          throw new Error("market_search_failed");
        }
      }
      return {
        summary: summarizeResults(results),
        citations: toCitations(results, MAX_RESULTS),
        provider: primary.name,
      };
    },
    { ttlSec: CACHE_TTL_SEC, dailyCap: DAILY_CAP, enabled: enabled() },
  );

  if (result.ok) return Response.json(result.data);
  const refused: MarketContext = { summary: null, citations: [], provider: null, reason: result.reason };
  return Response.json(refused);
}
