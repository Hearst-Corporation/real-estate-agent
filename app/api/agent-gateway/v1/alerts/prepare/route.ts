/**
 * POST /api/agent-gateway/v1/alerts/prepare — interface `alerts.prepare`.
 *
 * Mapping honnête : contenu structuré construit à partir d'un match déjà
 * persisté (`prosp_matchs`, via matching.persist) — même formatage que
 * lib/prospection/alert.ts (formatAlerte/formatAlerteHtml), SANS envoi.
 * Idempotent par construction : préparer deux fois le même match_id retourne
 * le même contenu (dérivé déterministe des données déjà en base), jamais un
 * doublon en file — pas besoin de clé d'idempotence dédiée puisqu'aucune
 * écriture n'a lieu ici (lecture pure, § contrat : "sans l'envoyer").
 */
import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { dbRowToAnnonce } from "@/lib/prospection/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  match_id: z.string().uuid(),
}).strict();

function formatAlertText(a: ReturnType<typeof dbRowToAnnonce>, score: number): string {
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "Prix NC";
  const surface = a.surface ? `${a.surface}m²` : "";
  const pieces = a.pieces ? `${a.pieces}p` : "";
  return [
    `Nouveau match ${score}/100`,
    `${a.titre ?? a.typeBien} · ${[surface, pieces].filter(Boolean).join(" · ")} · ${prix}`,
    `${a.ville ?? a.codePostal ?? ""}`,
    a.url ? a.url : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const POST = defineGatewayRoute({
  interfaceName: "alerts.prepare",
  schema: BodySchema,
  timeoutMs: 8_000,
  handler: async (input) => {
    const db = getSupabaseAdmin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const { data: match, error: matchError } = await db
      .from("prosp_matchs")
      .select(
        "id, score_match, alerte_envoyee, critere_id, annonce_id, prosp_annonces(*), prosp_criteres_acquereur(alerte_email, alerte_whatsapp, telephone)",
      )
      .eq("id", input.match_id)
      .eq("tenant_id", input.tenant_id)
      .eq("user_id", input.actor_user_id)
      .maybeSingle();

    if (matchError) return { status: "UNAVAILABLE", reason: "match_lookup_failed" };
    if (!match) return { status: "DENIED", reason: "match_not_found" };

    const annonceRaw = Array.isArray(match.prosp_annonces)
      ? match.prosp_annonces[0]
      : match.prosp_annonces;
    const critereRaw = Array.isArray(match.prosp_criteres_acquereur)
      ? match.prosp_criteres_acquereur[0]
      : match.prosp_criteres_acquereur;
    if (!annonceRaw) return { status: "UNAVAILABLE", reason: "annonce_missing" };

    const annonce = dbRowToAnnonce(annonceRaw as Record<string, unknown>);
    const content = formatAlertText(annonce, match.score_match);

    const channel: "whatsapp" | "email" | "none" = critereRaw?.alerte_whatsapp
      ? "whatsapp"
      : critereRaw?.alerte_email
        ? "email"
        : "none";

    return {
      status: "AVAILABLE",
      data: {
        match_id: match.id,
        already_dispatched: Boolean(match.alerte_envoyee),
        content,
        proposed_channel: channel,
        annonce_id: match.annonce_id,
        buyer_id: match.critere_id,
        score: match.score_match,
      },
    };
  },
});
