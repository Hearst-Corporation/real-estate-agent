/**
 * POST /api/agent-gateway/v1/alerts/dispatch — interface `alerts.dispatch`.
 *
 * Mapping honnête : réplique le pattern claim-atomique de
 * lib/jobs/inngest/functions.ts (prospScoring) — pose `alerte_at` AVANT
 * l'envoi, conditionné à `alerte_at IS NULL`, pour qu'un rejeu (même
 * idempotency_key OU appel concurrent) ne ré-envoie JAMAIS une notification
 * déjà délivrée (§ contrat : "critique ici"). Envoi réel via
 * lib/prospection/alert.ts sendMatchAlerte (WhatsApp Twilio / email Resend).
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import { sendMatchAlerte } from "@/lib/prospection/alert";
import { dbRowToAnnonce, dbRowToCritere } from "@/lib/prospection/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  match_id: z.string().uuid(),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "alerts.dispatch",
  schema: BodySchema,
  timeoutMs: 15_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    return runIdempotentWrite(
      input.tenant_id,
      "alerts.dispatch",
      input.idempotency_key,
      input,
      async () => {
        const { data: match, error: matchError } = await db
          .from("prosp_matchs")
          .select(
            "id, score_match, alerte_envoyee, alerte_at, critere_id, annonce_id, prosp_annonces(*), prosp_criteres_acquereur(*)",
          )
          .eq("id", input.match_id)
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.actor_user_id)
          .maybeSingle();

        if (matchError) return { status: "UNAVAILABLE", reason: "match_lookup_failed" };
        if (!match) return { status: "DENIED", reason: "match_not_found" };

        if (match.alerte_envoyee) {
          return {
            status: "AVAILABLE" as const,
            data: {
              match_id: match.id,
              sent: true,
              already_sent: true,
              channel: undefined as string | undefined,
            },
          };
        }

        const annonceRaw = Array.isArray(match.prosp_annonces)
          ? match.prosp_annonces[0]
          : match.prosp_annonces;
        const critereRaw = Array.isArray(match.prosp_criteres_acquereur)
          ? match.prosp_criteres_acquereur[0]
          : match.prosp_criteres_acquereur;
        if (!annonceRaw || !critereRaw)
          return { status: "UNAVAILABLE", reason: "match_context_missing" };

        // Claim atomique anti-double-envoi : pose alerte_at conditionné à IS NULL.
        const { data: claimed } = await db
          .from("prosp_matchs")
          .update({ alerte_at: new Date().toISOString() })
          .eq("id", match.id)
          .eq("tenant_id", input.tenant_id)
          .is("alerte_at", null)
          .select("id")
          .maybeSingle();

        if (!claimed) {
          // Un autre appel a déjà le claim (course concurrente) — pas un échec,
          // juste pas cet appel-ci qui envoie.
          return { status: "UNAVAILABLE", reason: "claim_lost_concurrent_dispatch" };
        }

        const annonce = dbRowToAnnonce(annonceRaw as Record<string, unknown>);
        const critere = dbRowToCritere(critereRaw as Record<string, unknown>);

        try {
          const result = await sendMatchAlerte(
            input.tenant_id,
            critere,
            annonce,
            match.score_match,
          );
          if (result.sent) {
            await db
              .from("prosp_matchs")
              .update({ alerte_envoyee: true })
              .eq("id", match.id)
              .eq("tenant_id", input.tenant_id);
            return {
              status: "AVAILABLE" as const,
              data: {
                match_id: match.id,
                sent: true,
                already_sent: false,
                channel: result.channel,
              },
            };
          }
          // Pas d'envoi réel (cooldown/cap/no_channel) — relâche le claim pour
          // réessai ultérieur, jamais un succès fabriqué.
          await db
            .from("prosp_matchs")
            .update({ alerte_at: null, alerte_envoyee: false })
            .eq("id", match.id)
            .eq("tenant_id", input.tenant_id);
          return { status: "UNAVAILABLE", reason: result.reason ?? "not_sent" };
        } catch (err) {
          await db
            .from("prosp_matchs")
            .update({ alerte_at: null, alerte_envoyee: false })
            .eq("id", match.id)
            .eq("tenant_id", input.tenant_id);
          console.error("[agent-gateway] alerts.dispatch send_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          return { status: "UNAVAILABLE", reason: "send_failed" };
        }
      },
    );
  },
});
