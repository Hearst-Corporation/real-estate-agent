/**
 * POST /api/agent-gateway/v1/valuations/update-interview — interface
 * `valuations.update_interview`.
 *
 * Mapping honnête, SANS LLM (la route produit /api/estimations/[id]/interview
 * streame un tour conversationnel OpenAI/Claude — hors périmètre gateway,
 * server-to-server n'a pas de conversation à streamer). Ici : réponses
 * STRUCTURÉES d'entretien fournies directement par l'agent, un champ = une
 * question du référentiel fermé `lib/estimation/spec.ts` BLOCKS (§ contrat :
 * "schéma fermé de questions, pas de texte libre non catégorisé"). Persiste
 * dans `estimation_messages` (rôle system, traçabilité) + merge dans
 * `estimations.property`/`field_status`. Ne déclenche PAS de recalcul — signal
 * `revaluation_needed` seulement (§ contrat : "signal, pas déclenchement direct").
 */
import "server-only";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { BLOCKS } from "@/lib/estimation/spec";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";
import type { Json } from "@/lib/gpu1/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Référentiel fermé des champs interrogeables — dérivé de BLOCKS (source unique
// partagée avec le Cockpit UI), jamais un champ arbitraire hors de ce schéma.
const KNOWN_FIELDS = new Set(
  BLOCKS.flatMap((b) => b.questions.map((q) => q.field)).filter(
    (f): f is keyof PropertyData => f !== null,
  ),
);

const AnswerSchema = z.object({
  field: z.string().trim().min(1).max(80),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  estimation_id: z.string().uuid(),
  answers: z.array(AnswerSchema).min(1).max(50),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "valuations.update_interview",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    // Rejet des champs hors référentiel fermé (jamais de texte libre non
    // catégorisé injecté dans property).
    const unknownFields = input.answers
      .map((a) => a.field)
      .filter((f) => !KNOWN_FIELDS.has(f as keyof PropertyData));
    if (unknownFields.length > 0) {
      return { status: "DENIED", reason: `unknown_fields:${unknownFields.join(",")}` };
    }

    const estimation = await loadOwnedEstimation(
      db,
      input.estimation_id,
      input.actor_user_id,
      input.tenant_id,
    );
    if (!estimation) return { status: "DENIED", reason: "estimation_not_found" };
    if (estimation.status === "archived") {
      return { status: "DENIED", reason: "estimation_archived" };
    }

    return runIdempotentWrite(
      input.tenant_id,
      "valuations.update_interview",
      input.idempotency_key,
      input,
      async () => {
        const property = { ...(estimation.property as PropertyData) };
        const fieldStatus = { ...(estimation.field_status as FieldStatusMap) };
        const appliedFields: string[] = [];

        for (const answer of input.answers) {
          (property as Record<string, unknown>)[answer.field] = answer.value;
          (fieldStatus as Record<string, string>)[answer.field] = "answered";
          appliedFields.push(answer.field);
        }

        const { data: message, error: msgError } = await db
          .from("estimation_messages")
          .insert({
            estimation_id: input.estimation_id,
            tenant_id: input.tenant_id,
            user_id: input.actor_user_id === "system" ? null : input.actor_user_id,
            role: "system",
            content: `agent-gateway valuations.update_interview: ${appliedFields.join(", ")}`,
            tool_input: input.answers as unknown as Json,
          })
          .select("id")
          .single();

        if (msgError || !message) {
          console.error("[agent-gateway] valuations.update_interview message_insert_failed", {
            code: msgError?.code,
          });
          return { status: "UNAVAILABLE", reason: "message_insert_failed" };
        }

        const { error: updateError } = await db
          .from("estimations")
          .update({
            property: property as unknown as Json,
            field_status: fieldStatus as unknown as Json,
            status: estimation.status === "draft" ? "interviewing" : estimation.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.estimation_id)
          .eq("tenant_id", input.tenant_id);

        if (updateError) {
          console.error("[agent-gateway] valuations.update_interview estimation_update_failed", {
            code: updateError.code,
          });
          return { status: "UNAVAILABLE", reason: "estimation_update_failed" };
        }

        return {
          status: "AVAILABLE",
          data: {
            interview_id: message.id,
            applied_fields: appliedFields,
            // Signal seul (§ contrat) : le recalcul n'est jamais déclenché par
            // cette interface. L'appelant décide d'invoquer valuations.get
            // après relance du pipeline côté produit.
            revaluation_needed:
              estimation.status === "ready" || estimation.status === "interviewing",
          },
        };
      },
    );
  },
});
