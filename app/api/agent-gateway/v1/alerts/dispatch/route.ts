/**
 * POST /api/agent-gateway/v1/alerts/dispatch — interface `alerts.dispatch`.
 *
 * ACTION SENSIBLE, IRRÉVERSIBLE — fail-closed strict (durcissement A2) :
 *
 *   1. APPROBATION HUMAINE PERSISTÉE OBLIGATOIRE (approval.ts / migration 0045),
 *      liée à (tenant, acteur, agent, match, canal, HASH du contenu), à USAGE
 *      UNIQUE, expirable. Consommée atomiquement AVANT tout envoi. Preuve absente
 *      / expirée / ne correspondant plus → DENIED, AUCUN envoi. Aucune
 *      auto-approbation. (Table 0045 non déployée gpu1 → introuvable → DENIED en
 *      pratique : l'envoi reste UNAVAILABLE tant que l'infra HITL n'est pas posée.)
 *   2. OPT-OUT revérifié AU MOMENT de l'envoi (isOptedOut, fail-closed).
 *   3. Claim atomique anti-double-envoi (`alerte_at` conditionné à IS NULL) — un
 *      rejeu (même idempotency_key OU appel concurrent) ne ré-envoie jamais.
 *   4. Cooldown / plafond WhatsApp vérifiés dans sendMatchAlerte (fail-closed).
 *   5. Provenance : agentId/runId(requestId)/date/canal journalisés dans l'audit
 *      (porté par handler.ts) ; message d'audit métier sur le match.
 *
 * Envoi réel via lib/prospection/alert.ts sendMatchAlerte (Twilio/Resend) —
 * atteint UNIQUEMENT après approbation consommée. Aucun envoi si ok:false.
 */
import "server-only";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import { consumeAlertApproval } from "@/lib/agent-gateway/approval";
import { formatAlertContent } from "@/lib/agent-gateway/alert-content";
import { sendMatchAlerte } from "@/lib/prospection/alert";
import { isOptedOut } from "@/lib/prospection/contact";
import { dbRowToAnnonce, dbRowToCritere } from "@/lib/prospection/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  match_id: z.string().uuid(),
}).strict();

/**
 * Forme de la projection avec relations embarquées PostgREST (`prosp_annonces(*)`,
 * `prosp_criteres_acquereur(*)`). Le client GPU1 n'infère pas la chaîne de select
 * (relations embarquées) — on annonce donc explicitement la forme via `from<T>()`,
 * comme le permet supabase-js pour les projections. Les relations reviennent en
 * objet OU tableau selon la cardinalité → le handler normalise (`Array.isArray`).
 */
type EmbeddedRow = Record<string, unknown> | Record<string, unknown>[] | null;
interface MatchWithContext {
  id: string;
  score_match: number;
  alerte_envoyee: boolean;
  alerte_at: string | null;
  critere_id: string;
  annonce_id: string;
  prosp_annonces: EmbeddedRow;
  prosp_criteres_acquereur: EmbeddedRow;
}

export const POST = defineGatewayRoute({
  interfaceName: "alerts.dispatch",
  schema: BodySchema,
  timeoutMs: 15_000,
  handler: async (input, ctx) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    return runIdempotentWrite(
      input.tenant_id,
      "alerts.dispatch",
      input.idempotency_key,
      input,
      async () => {
        const { data: match, error: matchError } = await db
          .from<MatchWithContext>("prosp_matchs")
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
              approval_id: undefined as string | undefined,
              agent_id: undefined as string | undefined,
              run_id: undefined as string | undefined,
              dispatched_at: undefined as string | undefined,
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

        const annonce = dbRowToAnnonce(annonceRaw as Record<string, unknown>);
        const critere = dbRowToCritere(critereRaw as Record<string, unknown>);

        // Canal déterminé côté serveur à partir des préférences du critère — jamais
        // choisi par le payload. Même logique que alerts.prepare.
        const channel: "whatsapp" | "email" | null =
          critere.alerteWhatsapp && critere.telephone
            ? "whatsapp"
            : critere.alerteEmail && critere.leadId
              ? "email"
              : null;
        if (!channel) return { status: "UNAVAILABLE", reason: "no_channel" };

        // Contenu déterministe (identique à alerts.prepare) → base du hash approuvé.
        const content = formatAlertContent(annonce, match.score_match);

        // 1. APPROBATION HUMAINE (usage unique, fail-closed). Consommée AVANT tout
        //    envoi. Introuvable/expirée/hash divergent → DENIED, aucun envoi.
        const approval = await consumeAlertApproval(db, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          agentId: ctx.agentId,
          matchId: match.id,
          channel,
          content,
        });
        if (!approval.ok) {
          return { status: "DENIED", reason: approval.reason };
        }

        // 2. Opt-out revérifié au moment de l'envoi (fail-closed).
        const optOut = await isOptedOut(
          db,
          input.tenant_id,
          { phone: critere.telephone ?? null, email: null },
          match.annonce_id,
        );
        if (optOut.optedOut) {
          return { status: "DENIED", reason: optOut.reason ?? "opted_out" };
        }

        // 3. Claim atomique anti-double-envoi : pose alerte_at conditionné à IS NULL.
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

        try {
          // 4. Envoi réel — cooldown/plafond vérifiés dans sendMatchAlerte.
          const result = await sendMatchAlerte(
            input.tenant_id,
            critere,
            annonce,
            match.score_match,
          );
          if (result.sent) {
            // 5. Provenance sur l'enregistrement métier : agent + run + date + canal.
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
                channel: result.channel as string | undefined,
                approval_id: approval.approvalId as string | undefined,
                agent_id: ctx.agentId as string | undefined,
                run_id: ctx.requestId as string | undefined,
                dispatched_at: new Date().toISOString() as string | undefined,
              },
            };
          }
          // Pas d'envoi réel (cooldown/cap/no_channel) — relâche le claim pour
          // réessai ultérieur, jamais un succès fabriqué. NB l'approbation a été
          // consommée : un nouvel envoi exigera une nouvelle approbation humaine.
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
