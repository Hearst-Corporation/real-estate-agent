/**
 * POST /api/agent-gateway/v1/buyers/get-profile — interface `buyers.get_profile`.
 *
 * Même rapprochement que buyers.list : `prosp_criteres_acquereur` + le lead
 * lié (contact) si présent. Profil complet des critères, jamais un profil
 * fabriqué. NOT_FOUND explicite si l'id n'existe pas / n'appartient pas à
 * l'acteur+tenant. Donnée personnelle → audit systématique (porté par
 * lib/agent-gateway/handler.ts, pas optionnel ici).
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  buyer_id: z.string().uuid(),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "buyers.get_profile",
  schema: BodySchema,
  timeoutMs: 8_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const { data: critere, error } = await db
      .from("prosp_criteres_acquereur")
      .select("*")
      .eq("id", input.buyer_id)
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.actor_user_id)
      .maybeSingle();

    if (error) {
      console.error("[agent-gateway] buyers.get_profile fetch_failed", { code: error.code });
      return { status: "UNAVAILABLE", reason: "fetch_failed" };
    }
    if (!critere) return { status: "UNAVAILABLE", reason: "not_found" };

    let lead: { id: string; full_name: string; email: string | null; phone: string | null } | null =
      null;
    if (critere.lead_id) {
      const { data: leadRow } = await db
        .from("leads")
        .select("id, full_name, email, phone")
        .eq("id", critere.lead_id)
        .eq("tenant_id", input.tenant_id)
        .eq("user_id", input.actor_user_id)
        .maybeSingle();
      lead = leadRow ?? null;
    }

    return {
      status: "AVAILABLE",
      data: {
        buyer_id: critere.id,
        name: critere.nom,
        active: critere.actif,
        contact: lead,
        preferences: {
          type_bien: critere.type_bien,
          budget_min: critere.budget_min,
          budget_max: critere.budget_max,
          surface_min: critere.surface_min,
          surface_max: critere.surface_max,
          pieces_min: critere.pieces_min,
          pieces_max: critere.pieces_max,
          zones: critere.zones,
          terrasse: critere.terrasse,
          parking: critere.parking,
          ascenseur: critere.ascenseur,
          jardin: critere.jardin,
          piscine: critere.piscine,
          dpe_max: critere.dpe_max,
          alerte_email: critere.alerte_email,
          alerte_whatsapp: critere.alerte_whatsapp,
        },
        created_at: critere.created_at,
        updated_at: critere.updated_at,
      },
    };
  },
});
