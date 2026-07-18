/**
 * POST /api/agent-gateway/v1/buyers/update-preferences — interface
 * `buyers.update_preferences`.
 *
 * AVAILABLE côté contrat : réutilise le VRAI comportement de la route produit
 * PATCH /api/prospection/criteres via la logique PARTAGÉE
 * lib/prospection/criteres-update.ts (schéma Zod + `buildCriterePatch`). ZÉRO
 * duplication divergente — les mêmes bornes/enums (miroir CHECK 0043) et la même
 * règle de delta partiel (champ absent = non écrit, pas d'écrasement à null,
 * `type_bien` normalisé) s'appliquent aux deux surfaces.
 *
 * Frontière de confiance A2 (defineGatewayRoute → authz) AVANT toute écriture :
 * tenant/acteur DÉRIVÉS DE L'AUTH (jamais du payload), agent dans l'allowlist,
 * scope `write` accordé, acteur vérifié en base. La gateway restant CLOSE tant
 * que l'allowlist est vide (registre Aigent vide), cette capacité est AVAILABLE
 * mais NON APPELABLE en pratique — état correct et honnête.
 *
 *   - owner-check : le critère doit appartenir au tenant + à l'acteur (service-role
 *     bypasse RLS → filtrage user_id + tenant_id explicite) → sinon DENIED.
 *   - tenant-check : `input.tenant_id` a déjà été réécrit sur le tenant du token
 *     par la frontière ; on filtre dessus (jamais un tenant choisi par le payload).
 *   - idempotence : framework gateway (agent_gateway_idempotency_keys) — un rejeu
 *     de la même clé renvoie le même résultat, jamais une double écriture.
 *   - audit : porté systématiquement par le framework (provenance agent incluse).
 */
import "server-only";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import {
  CriterePreferencesFields,
  rangeChecks,
  buildCriterePatch,
} from "@/lib/prospection/criteres-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Schéma composé : enveloppe gateway (tenant/acteur/agent/delegation) +
 * idempotency_key + `buyer_id` (= id du critère acquéreur) + les MÊMES champs de
 * préférence que la route produit (CriterePreferencesFields), sous les MÊMES
 * bornes croisées (rangeChecks). `.strict()` rejette tout champ non déclaré
 * (défense en profondeur, cohérent avec les autres routes d'écriture) ; tous les
 * champs légitimes (enveloppe incluse) sont explicitement modélisés.
 */
const BodySchema = rangeChecks(
  GatewayEnvelopeSchema.extend({
    idempotency_key: IdempotencyKeySchema,
    buyer_id: z.string().uuid(),
    ...CriterePreferencesFields,
  }).strict(),
);

export const POST = defineGatewayRoute({
  interfaceName: "buyers.update_preferences",
  schema: BodySchema,
  timeoutMs: 10_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    // Delta partiel via la logique PARTAGÉE (même règle que PATCH produit).
    // `buyer_id`/enveloppe ignorés : buildCriterePatch ne retient que les
    // clés de préférence explicitement fournies.
    const patch = buildCriterePatch(input as unknown as Record<string, unknown>);
    if (Object.keys(patch).length === 0) {
      return { status: "UNAVAILABLE", reason: "no_fields" };
    }

    return runIdempotentWrite(
      input.tenant_id,
      "buyers.update_preferences",
      input.idempotency_key,
      input,
      async () => {
        // Owner-check + tenant-check : le critère doit appartenir à l'acteur
        // (DÉRIVÉ DE L'AUTH) DANS le tenant du token. Filtrage explicite car le
        // service-role bypasse RLS. Absent → DENIED (jamais d'écriture aveugle).
        const { data: owned, error: ownErr } = await db
          .from("prosp_criteres_acquereur")
          .select("id")
          .eq("id", input.buyer_id)
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.actor_user_id)
          .maybeSingle();
        if (ownErr) return { status: "UNAVAILABLE", reason: "buyer_lookup_failed" };
        if (!owned) return { status: "DENIED", reason: "buyer_not_found" };

        const { data, error } = await db
          .from("prosp_criteres_acquereur")
          .update(patch)
          .eq("id", input.buyer_id)
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.actor_user_id)
          .select("id")
          .single();

        if (error || !data) {
          console.error("[agent-gateway] buyers.update_preferences update_failed", {
            code: error?.code,
          });
          return { status: "UNAVAILABLE", reason: "update_failed" };
        }

        return {
          status: "AVAILABLE",
          data: { buyer_id: data.id, updated_fields: Object.keys(patch) },
        };
      },
    );
  },
});
