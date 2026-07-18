/**
 * POST /api/agent-gateway/v1/buyers/update-preferences — interface
 * `buyers.update_preferences`.
 *
 * UNAVAILABLE : `app/api/prospection/criteres/route.ts` n'expose que
 * GET/POST/DELETE sur `prosp_criteres_acquereur` — aucune route de mutation
 * PARTIELLE (delta de préférences) n'existe côté produit. Construire une
 * mutation ad hoc ici serait inventer une surface produit hors du périmètre
 * gateway (le contrat interdit la fabrication de comportement, pas seulement
 * de données — voir docs/projects/real-estate-agent/tool-gateway.md §4/§5).
 * Redevient AVAILABLE le jour où le produit expose un PATCH/PUT réel sur les
 * critères acquéreur (delta explicite, pas un remplacement total implicite).
 */
import "server-only";
import { defineUnavailableGatewayRoute } from "@/lib/agent-gateway/unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = defineUnavailableGatewayRoute(
  "buyers.update_preferences",
  "no_partial_update_route_on_prosp_criteres_acquereur",
);
