/**
 * POST /api/agent-gateway/v1/crm/create-lead — interface `crm.create_lead`.
 *
 * Mapping honnête : table `leads` (0008_crm.sql), même schéma que
 * POST /api/leads mais avec auth service-to-service + idempotence réelle
 * (une clé rejouée renvoie l'id du lead déjà créé, jamais de doublon CRM).
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
  full_name: z.string().trim().min(1).max(200),
  kind: z.enum(["acheteur", "vendeur"]).default("acheteur"),
  type_personne: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  budget_min: z.number().finite().nonnegative().optional(),
  budget_max: z.number().finite().nonnegative().optional(),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "crm.create_lead",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    return runIdempotentWrite(
      input.tenant_id,
      "crm.create_lead",
      input.idempotency_key,
      input,
      async () => {
        const { data, error } = await db
          .from("leads")
          .insert({
            user_id: input.actor_user_id,
            tenant_id: input.tenant_id,
            full_name: input.full_name,
            kind: input.kind,
            ...(input.type_personne ? { type_personne: input.type_personne } : {}),
            email: input.email ?? null,
            phone: input.phone ?? null,
            source: input.source ?? null,
            budget_min: input.budget_min ?? null,
            budget_max: input.budget_max ?? null,
            status: "nouveau",
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] crm.create_lead insert_failed", { code: error?.code });
          return { status: "UNAVAILABLE", reason: "insert_failed" };
        }

        return { status: "AVAILABLE", data: { lead_id: data.id } };
      },
    );
  },
});
