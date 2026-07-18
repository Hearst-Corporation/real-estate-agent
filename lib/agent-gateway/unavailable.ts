/**
 * lib/agent-gateway/unavailable.ts — factory pour les interfaces sans mapping
 * honnête côté produit (§4/§5 du contrat : jamais de donnée fabriquée).
 */
import "server-only";
import { GatewayEnvelopeSchema } from "./contracts";
import { defineGatewayRoute } from "./handler";

/**
 * Construit une route qui retourne toujours UNAVAILABLE proprement typé,
 * après avoir validé auth + schéma commun (tenant/acteur) — jamais un
 * court-circuit avant l'auth, jamais une donnée simulée en retour.
 */
export function defineUnavailableGatewayRoute(interfaceName: string, reason: string) {
  return defineGatewayRoute({
    interfaceName,
    schema: GatewayEnvelopeSchema.extend({
      // Accepte tout champ métier additionnel sans le valider strictement :
      // l'interface est UNAVAILABLE quel que soit le payload, mais on garde
      // tenant/acteur obligatoires (fail-closed sur l'identité de l'appel).
    }).passthrough(),
    timeoutMs: 5_000,
    handler: async () => ({ status: "UNAVAILABLE" as const, reason }),
  });
}
