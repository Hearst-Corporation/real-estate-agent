import "server-only";

import type { AigentAvailability } from "@/lib/aigent/types";

/**
 * Client de la frontière Aigent — FEATURE-DETECTION, server-only.
 * =================================================================
 *
 * Ce module ne fabrique JAMAIS d'agent, de run ou de résultat. Il se contente de
 * DÉTECTER si la plateforme Aigent est branchée à ce workspace, et — le jour où
 * elle le sera — de servir de point d'entrée en lecture/lancement (consommateur).
 *
 * Tant que `AIGENT_BASE_URL` (+ `AIGENT_API_KEY`) sont absents, `getAvailability()`
 * renvoie `{ available:false, reason:'not_configured' }` et **aucune requête
 * réseau n'est émise**. C'est l'état honnête et attendu (règle de vérité du brief).
 *
 * Aucune valeur de secret n'est jamais renvoyée ni loggée.
 */

/** Vrai si la configuration minimale d'Aigent est présente dans l'environnement. */
export function isAigentConfigured(): boolean {
  return Boolean(process.env.AIGENT_BASE_URL && process.env.AIGENT_API_KEY);
}

/**
 * Détecte l'état RÉEL de la frontière. N'émet aucune requête quand la config est
 * absente. Fail-soft : toute défaillance renvoie un état `available:false`
 * qualifié, jamais un throw — la page de profil ne doit jamais casser à cause
 * d'Aigent.
 */
export function getAvailability(): AigentAvailability {
  if (!isAigentConfigured()) {
    return { available: false, reason: "not_configured", truth: "UNAVAILABLE" };
  }
  // Config présente : la connexion réelle (list agents / runs) sera implémentée
  // ICI le jour où Aigent poussera un endpoint contrat. Tant que ce chemin n'est
  // pas vérifié de bout en bout contre une vraie instance, on reste honnête et on
  // ne prétend PAS que c'est LIVE : on signale que la config existe mais que le
  // canal n'est pas encore établi. Aucune donnée n'est inventée.
  return { available: false, reason: "unreachable", truth: "UNAVAILABLE" };
}
