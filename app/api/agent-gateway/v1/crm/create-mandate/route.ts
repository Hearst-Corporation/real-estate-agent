/**
 * POST /api/agent-gateway/v1/crm/create-mandate — interface `crm.create_mandate`.
 *
 * Mapping honnête : table `mandates` (0008_crm.sql). Engagement contractuel :
 * aucune valeur par défaut inventée sur les clauses (§ crm.create_mandate) —
 * `kind`/`status` ont un défaut PRODUIT existant (même défaut que
 * POST /api/mandates), mais property_id doit être fourni et possédé par
 * l'acteur, sinon rejet, jamais un lien deviné.
 */
import "server-only";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  property_id: z.string().uuid(),
  kind: z.enum(["simple", "exclusif", "semi_exclusif"]).default("simple"),
  reference: z.string().trim().max(120).optional(),
  asking_price: z.number().finite().nonnegative().optional(),
  commission_pct: z.number().finite().min(0).max(100).optional(),
  signed_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
  status: z
    .enum(["brouillon", "actif", "suspendu", "expire", "resilie", "realise"])
    .default("brouillon"),
  notes: z.string().trim().max(4000).optional(),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "crm.create_mandate",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const { data: property, error: propErr } = await db
      .from("properties")
      .select("id")
      .eq("id", input.property_id)
      .eq("user_id", input.actor_user_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();
    if (propErr) return { status: "UNAVAILABLE", reason: "property_lookup_failed" };
    if (!property) return { status: "DENIED", reason: "property_not_found" };

    return runIdempotentWrite(
      input.tenant_id,
      "crm.create_mandate",
      input.idempotency_key,
      input,
      async () => {
        const { data, error } = await db
          .from("mandates")
          .insert({
            user_id: input.actor_user_id,
            tenant_id: input.tenant_id,
            property_id: input.property_id,
            kind: input.kind,
            reference: input.reference ?? null,
            asking_price: input.asking_price ?? null,
            commission_pct: input.commission_pct ?? null,
            signed_at: input.signed_at ?? null,
            expires_at: input.expires_at ?? null,
            status: input.status,
            notes: input.notes ?? null,
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] crm.create_mandate insert_failed", { code: error?.code });
          return { status: "UNAVAILABLE", reason: "insert_failed" };
        }

        return { status: "AVAILABLE", data: { mandate_id: data.id } };
      },
    );
  },
});
