/**
 * lib/agent-gateway/scopes.ts — modèle de scope des interfaces gateway.
 *
 * Chaque interface `domaine.action` est classée `read` ou `write`. Un token
 * gateway porte un ensemble de scopes accordés (via config env, cf. authz.ts) ;
 * une interface dont le scope requis n'est pas accordé → DENIED (fail-closed).
 *
 * Les écritures (persistance, mutations, dispatch) exigent `write` — strictement
 * plus que les lectures (`read`). Aucune interface n'est "sans scope" : toute
 * interface inconnue de cette table est traitée comme `write` (le plus strict),
 * jamais autorisée par défaut.
 */
import "server-only";

export type Scope = "read" | "write";

/**
 * Classement figé des 14 interfaces (source : tool-gateway.md + brief A2).
 * Lectures : buyers.list/get_profile, matching.compute, valuations.get,
 * listings.collect/normalize, alerts.prepare. Écritures : matching.persist,
 * buyers.update_preferences, valuations.update_interview, crm.create_*,
 * alerts.dispatch.
 *
 * NB listings.collect : lecture au sens capacité (scope `read`) — elle interroge
 * des providers externes et alimente le cache d'annonces partagé, mais ne mute
 * aucune donnée métier possédée par l'acteur (pas de lead/mandat/bien/estimation).
 * alerts.prepare : lecture pure (aucune écriture). alerts.dispatch : `write` +
 * garde-fou HITL supplémentaire (approbation persistée, cf. approval.ts).
 */
export const INTERFACE_SCOPES: Record<string, Scope> = {
  // ── Lectures ───────────────────────────────────────────────────────────────
  "buyers.list": "read",
  "buyers.get_profile": "read",
  "matching.compute": "read",
  "valuations.get": "read",
  "listings.collect": "read",
  "listings.normalize": "read",
  "alerts.prepare": "read",
  // ── Écritures ──────────────────────────────────────────────────────────────
  "matching.persist": "write",
  "buyers.update_preferences": "write",
  "valuations.update_interview": "write",
  "crm.create_lead": "write",
  "crm.create_property": "write",
  "crm.create_mandate": "write",
  "crm.create_visit": "write",
  "alerts.dispatch": "write",
};

/**
 * Scope requis par une interface. Défaut fail-closed : une interface absente de
 * la table est traitée comme `write` (le plus strict) — jamais `read` par erreur.
 */
export function requiredScope(interfaceName: string): Scope {
  return INTERFACE_SCOPES[interfaceName] ?? "write";
}
