/**
 * POST /api/agent-gateway/v1/listings/normalize — interface `listings.normalize`.
 *
 * AVAILABLE : normalisation PURE d'annonces brutes multi-sources vers le schéma
 * canonique `prosp_annonces`, SANS AUCUNE PERSISTANCE. Réutilise la logique
 * PARTAGÉE lib/prospection/normalize.ts qui COMPOSE les fonctions de l'ingestion
 * réelle (`normalizeMoteurImmo`/`normalizeApify`+`toMoteurImmo` → `toAnnonceRow` +
 * `hashDedup`) — parité GARANTIE PAR CONSTRUCTION (mêmes fonctions que
 * `upsertAnnonces`), pas une seconde implémentation divergente. Déterministe
 * (`now` figé par requête). Scope `read` (aucune mutation métier).
 *
 * Frontière de confiance A2 (defineGatewayRoute → authz) AVANT tout traitement :
 * tenant DÉRIVÉ DE L'AUTH (le `tenant_id` intégré aux lignes est celui du token,
 * jamais du payload), agent dans l'allowlist, scope `read` accordé, acteur
 * vérifié. Gateway CLOSE tant que l'allowlist est vide → AVAILABLE mais non
 * appelable en pratique (honnête). Données métier brutes = non fiables : on ne
 * fait que les FORMATER, jamais les exécuter ni les écrire.
 */
import "server-only";
import { z } from "zod";
import { GatewayEnvelopeSchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import {
  normalizeListings,
  isKnownNormalizeSource,
  UnknownSourceError,
} from "@/lib/prospection/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;

const BodySchema = GatewayEnvelopeSchema.extend({
  // Source d'ingestion à normaliser (canonique ou alias reconnu).
  source: z.enum(["moteurimmo", "leboncoin", "apify_lbc", "bienici"]),
  // Items bruts tels que renvoyés par la source (objets opaques, formatés jamais exécutés).
  items: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ITEMS),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "listings.normalize",
  schema: BodySchema,
  timeoutMs: 15_000,
  handler: async (input) => {
    if (!isKnownNormalizeSource(input.source)) {
      return { status: "UNAVAILABLE", reason: "unknown_source" };
    }

    try {
      // `now` figé par requête → sortie déterministe (updated_at stable).
      const nowIso = new Date().toISOString();
      const result = normalizeListings(input.tenant_id, input.source, input.items, nowIso);
      return {
        status: "AVAILABLE",
        data: {
          source: result.source,
          normalized_count: result.normalized.length,
          skipped: result.skipped,
          // Lignes canoniques + empreinte de dédup (identique à celle qu'aurait
          // le bien en base). Aucune écriture n'a eu lieu.
          listings: result.normalized.map((n) => ({
            hash_dedup: n.hashDedup,
            row: n.row,
          })),
        },
      };
    } catch (err) {
      if (err instanceof UnknownSourceError) {
        return { status: "UNAVAILABLE", reason: "unknown_source" };
      }
      console.error("[agent-gateway] listings.normalize failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { status: "UNAVAILABLE", reason: "normalize_failed" };
    }
  },
});
