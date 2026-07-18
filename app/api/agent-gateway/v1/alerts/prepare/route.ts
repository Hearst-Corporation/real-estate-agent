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
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { formatAlertContent } from "@/lib/agent-gateway/alert-content";
import { contentHash } from "@/lib/agent-gateway/approval";
import { dbRowToAnnonce } from "@/lib/prospection/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = GatewayEnvelopeSchema.extend({
  match_id: z.string().uuid(),
}).strict();

/**
 * Forme de la projection avec relations embarquées PostgREST. Le client GPU1
 * n'infère pas la chaîne de select (relations embarquées) — on annonce donc
 * explicitement la forme via `from<T>()`, que le client GPU1 accepte. Les
 * relations reviennent en objet OU tableau selon la cardinalité → le handler
 * normalise (`Array.isArray`).
 */
type CritereEmbedded =
  | { alerte_email: boolean | null; alerte_whatsapp: boolean | null; telephone: string | null }
  | Array<{ alerte_email: boolean | null; alerte_whatsapp: boolean | null; telephone: string | null }>
  | null;
interface MatchWithContext {
  id: string;
  score_match: number;
  alerte_envoyee: boolean;
  critere_id: string;
  annonce_id: string;
  prosp_annonces: Record<string, unknown> | Record<string, unknown>[] | null;
  prosp_criteres_acquereur: CritereEmbedded;
}

export const POST = defineGatewayRoute({
  interfaceName: "alerts.prepare",
  schema: BodySchema,
  timeoutMs: 8_000,
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const { data: match, error: matchError } = await db
      .from<MatchWithContext>("prosp_matchs")
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
    const content = formatAlertContent(annonce, match.score_match);

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
        // Hash exact du contenu+canal à APPROUVER (HITL) : l'approbation humaine
        // se lie à ce hash ; dispatch refuse tout envoi dont le contenu ne le
        // reproduit pas. `none` → pas d'envoi possible, hash informatif seulement.
        content_hash:
          channel === "none" ? null : contentHash(channel, content),
        annonce_id: match.annonce_id,
        buyer_id: match.critere_id,
        score: match.score_match,
      },
    };
  },
});
