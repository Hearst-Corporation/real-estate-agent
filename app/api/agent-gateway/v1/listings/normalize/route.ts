/**
 * POST /api/agent-gateway/v1/listings/normalize — interface `listings.normalize`.
 *
 * UNAVAILABLE : le pipeline d'ingestion réel (lib/prospection/ingest.ts
 * upsertAnnonces + lib/prospection/mappers.ts toAnnonceRow) normalise DÉJÀ les
 * biens bruts vers le schéma canonique `prosp_annonces` au moment de l'écriture
 * — il n'existe aucune étape adressable séparément qui prend un "bien brut" en
 * entrée et retourne un "bien normalisé" sans l'écrire (§ contrat : "sans
 * persister" n'a pas d'équivalent ici, listings.collect ÉCRIT directement le
 * résultat déjà normalisé). Exposer cette interface obligerait soit à dupliquer
 * la logique de mapping hors de son point d'écriture (risque de divergence),
 * soit à fabriquer un résultat de normalisation fictif — les deux interdits
 * par §4/§5 du contrat.
 */
import "server-only";
import { defineUnavailableGatewayRoute } from "@/lib/agent-gateway/unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = defineUnavailableGatewayRoute(
  "listings.normalize",
  "no_standalone_normalization_step_normalization_is_inline_in_ingest_pipeline",
);
