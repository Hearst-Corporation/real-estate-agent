/**
 * POST /api/agent-gateway/v1/crm/create-visit — interface `crm.create_visit`.
 *
 * Mapping honnête : table `visits` (0008_crm.sql), même owner-checks (property
 * + lead optionnel doivent appartenir à tenant+acteur) que POST /api/visits,
 * avec auth service-to-service + idempotence réelle.
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  property_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  duration_min: z.number().int().positive().max(1440).default(30),
  status: z.enum(["planifiee", "confirmee", "realisee", "annulee", "no_show"]).default("planifiee"),
  notes: z.string().trim().max(4000).optional(),
}).strict();

async function ownedByActor(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: "properties" | "leads",
  id: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export const POST = defineGatewayRoute({
  interfaceName: "crm.create_visit",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const ownedProperty = await ownedByActor(
      db,
      "properties",
      input.property_id,
      input.actor_user_id,
      input.tenant_id,
    );
    if (!ownedProperty) return { status: "DENIED", reason: "property_not_found" };

    if (input.lead_id) {
      const ownedLead = await ownedByActor(
        db,
        "leads",
        input.lead_id,
        input.actor_user_id,
        input.tenant_id,
      );
      if (!ownedLead) return { status: "DENIED", reason: "lead_not_found" };
    }

    return runIdempotentWrite(
      input.tenant_id,
      "crm.create_visit",
      input.idempotency_key,
      input,
      async () => {
        const { data, error } = await db
          .from("visits")
          .insert({
            user_id: input.actor_user_id,
            tenant_id: input.tenant_id,
            property_id: input.property_id,
            lead_id: input.lead_id ?? null,
            scheduled_at: input.scheduled_at,
            duration_min: input.duration_min,
            status: input.status,
            notes: input.notes ?? null,
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] crm.create_visit insert_failed", { code: error?.code });
          return { status: "UNAVAILABLE", reason: "insert_failed" };
        }

        return { status: "AVAILABLE", data: { visit_id: data.id } };
      },
    );
  },
});
