/**
 * POST /api/agent-gateway/v1/matching/persist — interface `matching.persist`.
 *
 * Mapping honnête : upsert dans `prosp_matchs` (même table/pattern que
 * lib/jobs/inngest/functions.ts prospScoring). Persiste une paire déjà notée
 * par matching.compute — pas de recalcul implicite (§ contrat), le score et le
 * breakdown viennent du payload, jamais recalculés ici en silence.
 * Idempotence gateway (agent_gateway_idempotency_keys) EN PLUS de l'upsert
 * naturel de prosp_matchs — persister deux fois le même résultat ne crée pas
 * deux associations, quelle que soit la voie (clé rejouée OU upsert naturel).
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  buyer_id: z.string().uuid(), // critere_id
  annonce_id: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  breakdown: z.record(z.string(), z.number()).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
  engine_version: z.string().trim().min(1).max(40).optional(),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "matching.persist",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    // Ownership : le critère doit appartenir à l'acteur+tenant (owner-check
    // applicatif — service-role bypasse RLS).
    const { data: critere, error: critereError } = await db
      .from("prosp_criteres_acquereur")
      .select("id")
      .eq("id", input.buyer_id)
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.actor_user_id)
      .maybeSingle();
    if (critereError) return { status: "UNAVAILABLE", reason: "critere_lookup_failed" };
    if (!critere) return { status: "DENIED", reason: "buyer_not_found" };

    const { data: annonce, error: annonceError } = await db
      .from("prosp_annonces")
      .select("id")
      .eq("id", input.annonce_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();
    if (annonceError) return { status: "UNAVAILABLE", reason: "annonce_lookup_failed" };
    if (!annonce) return { status: "DENIED", reason: "annonce_not_found" };

    return runIdempotentWrite(
      input.tenant_id,
      "matching.persist",
      input.idempotency_key,
      input,
      async () => {
        const { data, error } = await db
          .from("prosp_matchs")
          .upsert(
            {
              tenant_id: input.tenant_id,
              user_id: input.actor_user_id,
              critere_id: input.buyer_id,
              annonce_id: input.annonce_id,
              score_match: input.score,
              score_breakdown: (input.breakdown ?? {}) as Json,
              features_snapshot: (input.features ?? {}) as Json,
              engine_version: input.engine_version ?? null,
            },
            { onConflict: "tenant_id,critere_id,annonce_id", ignoreDuplicates: false },
          )
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] matching.persist upsert_failed", { code: error?.code });
          return { status: "UNAVAILABLE", reason: "upsert_failed" };
        }

        return { status: "AVAILABLE", data: { match_id: data.id } };
      },
    );
  },
});
