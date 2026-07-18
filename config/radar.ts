/**
 * RADAR VENDEURS — seuils et bornes.
 * =================================================================
 * Constantes nommées du radar d'opportunités vendeurs. Zéro magic number
 * dans la logique : tout paramètre chiffré vit ici (surchargeable via env).
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Baisse de prix minimale (en €) pour qu'une annonce remonte comme signal. */
export const PRICE_DROP_MIN_EUR = envInt("RADAR_PRICE_DROP_MIN_EUR", 1);

/**
 * Ancienneté (jours) au-delà de laquelle une annonce active est « dormante »
 * si elle n'a pas été mise à jour depuis.
 */
export const DORMANT_MIN_DAYS = envInt("RADAR_DORMANT_MIN_DAYS", 60);

/** Fenêtre (jours) avant expiration d'un mandat pour lever le signal. */
export const MANDATE_EXPIRY_WINDOW_DAYS = envInt("RADAR_MANDATE_EXPIRY_WINDOW_DAYS", 30);

/** Nombre max d'items retournés par section (borne dure sur chaque liste). */
export const RADAR_SECTION_LIMIT = envInt("RADAR_SECTION_LIMIT", 50);

/** Statuts de mandat considérés « actifs » (donc éligibles au signal d'expiration). */
export const MANDATE_ACTIVE_STATUSES = ["active", "signed", "en_cours"] as const;
