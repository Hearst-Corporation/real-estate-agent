/**
 * POST /api/agent-gateway/v1/valuations/get — interface `valuations.get`.
 *
 * Lecture (pas GET HTTP : la gateway est server-to-server, un seul verbe par
 * route pour porter tenant/acteur/scopes dans un body validé — cohérent avec
 * les autres interfaces gateway). Mapping honnête : table `estimations`.
 * Une estimation sans valorisation calculée (`valuation`/`market_value` null,
 * status draft/interviewing) est UNAVAILABLE — jamais une valeur par défaut.
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  property_id: z.string().uuid().optional(),
  estimation_id: z.string().uuid().optional(),
})
  .strict()
  .refine((b) => Boolean(b.property_id || b.estimation_id), {
    message: "property_id ou estimation_id requis",
  });

export const POST = defineGatewayRoute({
  interfaceName: "valuations.get",
  schema: BodySchema,
  timeoutMs: 8_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    let query = db
      .from("estimations")
      .select(
        "id, status, market_value, recommended_price, valuation, data_status, engine_version, valued_at, property_id",
      )
      .eq("user_id", input.actor_user_id)
      .eq("tenant_id", input.tenant_id);

    query = input.estimation_id
      ? query.eq("id", input.estimation_id)
      : query.eq("property_id", input.property_id!);

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[agent-gateway] valuations.get fetch_failed", { code: error.code });
      return { status: "UNAVAILABLE", reason: "fetch_failed" };
    }
    if (!data) return { status: "UNAVAILABLE", reason: "not_found" };

    // Estimation non encore valorisée (draft/interviewing, pas de market_value) :
    // aucune fourchette fiable → UNAVAILABLE plutôt qu'un zéro/placeholder (§ valuations.get).
    if (data.market_value == null || data.valuation == null) {
      return { status: "UNAVAILABLE", reason: "not_yet_valued" };
    }

    return {
      status: "AVAILABLE",
      data: {
        estimation_id: data.id,
        property_id: data.property_id,
        market_value: data.market_value,
        recommended_price: data.recommended_price,
        valuation: data.valuation,
        data_status: data.data_status,
        engine_version: data.engine_version,
        valued_at: data.valued_at,
      },
    };
  },
});
