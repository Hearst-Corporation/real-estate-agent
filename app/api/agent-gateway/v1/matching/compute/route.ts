/**
 * POST /api/agent-gateway/v1/matching/compute — interface `matching.compute`.
 *
 * Mapping honnête : moteur pur lib/prospection/matching/match.ts (matchAnnonce),
 * le même que lib/jobs/inngest/functions.ts (prospScoring cron). Lecture seule,
 * pas de persistance ici (matching.persist en fait une interface séparée, comme
 * le contrat l'exige — matching.compute ne doit PAS écrire).
 * Facteurs explicatifs toujours séparés du score brut (§ contrat : "jamais un
 * score sans justification").
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { matchAnnonce } from "@/lib/prospection/matching/match";
import { dbRowToAnnonce, dbRowToCritere } from "@/lib/prospection/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  buyer_id: z.string().uuid(), // critere_id (prosp_criteres_acquereur.id)
  annonce_ids: z.array(z.string().uuid()).min(1).max(200).optional(),
  max_annonces: z.number().int().positive().max(500).default(200),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "matching.compute",
  schema: BodySchema,
  timeoutMs: 20_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const { data: critereRow, error: critereError } = await db
      .from("prosp_criteres_acquereur")
      .select("*")
      .eq("id", input.buyer_id)
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.actor_user_id)
      .maybeSingle();
    if (critereError) return { status: "UNAVAILABLE", reason: "critere_fetch_failed" };
    if (!critereRow) return { status: "DENIED", reason: "buyer_not_found" };

    const critere = dbRowToCritere(critereRow as Record<string, unknown>);

    let annoncesQuery = db
      .from("prosp_annonces")
      .select("*")
      .eq("tenant_id", input.tenant_id)
      .eq("actif", true)
      .limit(input.max_annonces);

    if (input.annonce_ids && input.annonce_ids.length > 0) {
      annoncesQuery = annoncesQuery.in("id", input.annonce_ids);
    }

    const { data: annonceRows, error: annonceError } = await annoncesQuery;
    if (annonceError) return { status: "UNAVAILABLE", reason: "annonces_fetch_failed" };

    const pairs = (annonceRows ?? [])
      .map((row) => {
        const annonce = dbRowToAnnonce(row as Record<string, unknown>);
        const result = matchAnnonce(critere, annonce);
        if (!result) return null;
        return {
          annonce_id: annonce.id,
          buyer_id: critere.id,
          score: result.score,
          breakdown: result.breakdown,
          explain: result.explain,
          recommandation: result.recommandation,
          engine_version: result.engineVersion,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.score - a.score);

    return { status: "AVAILABLE", data: { pairs, evaluated: annonceRows?.length ?? 0 } };
  },
});
