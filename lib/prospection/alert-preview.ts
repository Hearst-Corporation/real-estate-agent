/**
 * lib/prospection/alert-preview.ts — MÉTA-DONNÉES d'alerte (config + aperçu),
 * PAS un moteur d'envoi. Fonctions pures, aucun I/O, aucun transport.
 *
 * RÈGLE DE VÉRITÉ : aucun transport email/WhatsApp réel n'est branché depuis
 * l'UI de préférences. Ce module expose UNIQUEMENT :
 *   - l'enum de fréquence LIVE (persistée en `prosp_criteres_acquereur.alerte_frequence`) ;
 *   - les garde-fous RÉELS déjà codés côté envoi (cooldown 24h, cap WhatsApp/jour)
 *     — repris ici comme valeurs affichées (aperçu), jamais exécutés ici.
 *
 * L'UI marque l'expérience « CONFIGURATION / APERÇU » et ne prétend JAMAIS
 * qu'une alerte est partie.
 */

/** Fréquences d'alerte — miroir EXACT du CHECK DB (migration 0043). */
export const ALERTE_FREQUENCES = ["immediate", "quotidien", "hebdo", "off"] as const;
export type AlerteFrequence = (typeof ALERTE_FREQUENCES)[number];

/** true si la valeur est une fréquence valide (garde-fou Zod + UI). */
export function isAlerteFrequence(v: unknown): v is AlerteFrequence {
  return typeof v === "string" && (ALERTE_FREQUENCES as readonly string[]).includes(v);
}

/**
 * Garde-fous d'envoi RÉELS (déclarés dans lib/prospection/alert.ts). Exposés pour
 * l'aperçu de configuration. Ne déclenchent aucun envoi — ce sont les bornes que
 * le job d'alerte applique quand/ si un transport est branché.
 */
export const ALERT_GUARDRAILS = {
  /** Cooldown anti-doublon par couple critère × annonce (heures). */
  cooldownHours: 24,
  /** Plafond d'envois WhatsApp par tenant et par jour (fail-closed). */
  whatsappCapPerDay: 10,
  /** Un envoi n'est JAMAIS automatique : confirmation humaine requise. */
  requiresHumanConfirmation: true,
  /** Désinscription (opt-out) respectée avant tout contact. */
  respectsOptOut: true,
} as const;

/** Statut de branchement d'un transport d'alerte. Aujourd'hui : aucun. */
export type AlertTransportStatus = "preview" | "live";

/** Le transport d'alerte est-il réellement branché ? (aujourd'hui : non). */
export function alertTransportStatus(): AlertTransportStatus {
  // Aucun job d'alerte n'est déclenché depuis l'UI de préférences. Rester honnête.
  return "preview";
}
