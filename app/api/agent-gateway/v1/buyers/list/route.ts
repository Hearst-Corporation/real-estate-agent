/**
 * POST /api/agent-gateway/v1/buyers/list — interface `buyers.list`.
 *
 * Mapping honnête, PARTIEL : le produit n'a pas d'entité "acheteur" autonome —
 * le plus proche est `prosp_criteres_acquereur` (critères de recherche, table
 * 0016_prosp_prospects_criteres.sql, lue par app/api/prospection/criteres).
 * On expose des RÉSUMÉS (jamais le profil complet — § buyers.list), filtrés
 * par tenant+acteur, paginés. Voir docs/projects/real-estate-agent/tool-gateway.md
 * §3.2 : ce mapping est un rapprochement du modèle produit réel, pas un profil
 * acheteur first-class au sens strict du contrat (pas d'historique de recherche
 * multi-session ni de mandats liés directement — seulement lead_id optionnel).
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  status: z.enum(["actif", "inactif", "tous"]).default("actif"),
  cursor: z.number().int().nonnegative().default(0),
  page_size: z.number().int().positive().max(200).default(50),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "buyers.list",
  schema: BodySchema,
  timeoutMs: 8_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    let query = db
      .from("prosp_criteres_acquereur")
      .select(
        "id, nom, lead_id, budget_min, budget_max, zones, actif, telephone, created_at, updated_at",
        { count: "exact" },
      )
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.actor_user_id)
      .order("updated_at", { ascending: false })
      .range(input.cursor, input.cursor + input.page_size - 1);

    if (input.status !== "tous") {
      query = query.eq("actif", input.status === "actif");
    }

    const { data, error, count } = await query;

    if (error) {
      const code = String((error as { code?: string }).code ?? "");
      if (code === "42P01" || code === "42703") {
        return { status: "UNAVAILABLE", reason: "schema_missing" };
      }
      console.error("[agent-gateway] buyers.list fetch_failed", { code: error.code });
      return { status: "UNAVAILABLE", reason: "fetch_failed" };
    }

    const items = (data ?? []).map((r) => ({
      buyer_id: r.id,
      name: r.nom,
      lead_id: r.lead_id,
      budget_min: r.budget_min,
      budget_max: r.budget_max,
      zones: r.zones,
      active: r.actif,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const nextCursor = items.length === input.page_size ? input.cursor + input.page_size : null;

    return {
      status: "AVAILABLE",
      data: { items, next_cursor: nextCursor, total: count ?? null },
    };
  },
});
