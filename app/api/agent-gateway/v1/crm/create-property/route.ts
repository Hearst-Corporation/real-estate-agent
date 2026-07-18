/**
 * POST /api/agent-gateway/v1/crm/create-property — interface `crm.create_property`.
 *
 * Mapping honnête : table `properties` (0008_crm.sql), même schéma que
 * POST /api/properties avec auth service-to-service + idempotence réelle.
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
  title: z.string().trim().min(1).max(200),
  property_type: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
  postal_code: z.string().trim().min(1).max(20),
  surface: z.number().finite().positive().optional(),
  rooms: z.number().int().nonnegative().optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  asking_price: z.number().finite().nonnegative().optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z
    .enum(["prospect", "estimation", "mandat", "en_vente", "sous_offre", "vendu", "archive"])
    .default("prospect"),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "crm.create_property",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    return runIdempotentWrite(
      input.tenant_id,
      "crm.create_property",
      input.idempotency_key,
      input,
      async () => {
        const { data, error } = await db
          .from("properties")
          .insert({
            user_id: input.actor_user_id,
            tenant_id: input.tenant_id,
            status: input.status,
            title: input.title,
            property_type: input.property_type,
            address: input.address,
            city: input.city,
            postal_code: input.postal_code,
            surface: input.surface ?? null,
            rooms: input.rooms ?? null,
            bedrooms: input.bedrooms ?? null,
            asking_price: input.asking_price ?? null,
            notes: input.notes ?? null,
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] crm.create_property insert_failed", { code: error?.code });
          return { status: "UNAVAILABLE", reason: "insert_failed" };
        }

        return { status: "AVAILABLE", data: { property_id: data.id } };
      },
    );
  },
});
