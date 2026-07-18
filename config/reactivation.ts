/**
 * RÉACTIVATION DES PROSPECTS DORMANTS — seuils et bornes.
 * =================================================================
 * Constantes nommées du moteur de réactivation. Zéro magic number dans la
 * logique : tout paramètre chiffré vit ici (surchargeable via env). Le seuil
 * de dormance est CONFIGURABLE — il gouverne à partir de quand un prospect
 * (acquéreur ou propriétaire) est considéré « sans activité récente ».
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Seuil de dormance (jours) : un prospect dont la dernière activité connue
 * (contact/visite/message/màj) remonte à plus de N jours ressort comme dormant.
 * Configurable par requête (`?days=`, borné) — cette valeur est le défaut.
 */
export const DORMANT_THRESHOLD_DAYS = envInt("REACTIVATION_DORMANT_DAYS", 45);

/** Borne basse acceptée pour le seuil passé en paramètre de requête. */
export const DORMANT_THRESHOLD_MIN_DAYS = envInt("REACTIVATION_DORMANT_MIN_DAYS", 7);

/** Borne haute acceptée pour le seuil passé en paramètre de requête. */
export const DORMANT_THRESHOLD_MAX_DAYS = envInt("REACTIVATION_DORMANT_MAX_DAYS", 365);

/** Nombre max de candidats retournés par catégorie (borne dure). */
export const REACTIVATION_SECTION_LIMIT = envInt("REACTIVATION_SECTION_LIMIT", 50);

/**
 * Statuts de lead considérés « encore vivants » (éligibles à une relance).
 * Un lead perdu/converti/archivé n'est PAS un candidat à la réactivation.
 */
export const REACTIVATION_ELIGIBLE_LEAD_STATUSES = [
  "new",
  "nouveau",
  "contacted",
  "contacte",
  "qualified",
  "qualifie",
  "active",
  "actif",
] as const;

/** Statuts de mandat « actifs » — un propriétaire sous mandat vivant est relançable. */
export const REACTIVATION_ACTIVE_MANDATE_STATUSES = ["active", "signed", "en_cours"] as const;

/** Nombre max de biens pertinents cités dans un brouillon acquéreur. */
export const REACTIVATION_MATCH_HINT_LIMIT = envInt("REACTIVATION_MATCH_HINT_LIMIT", 3);
