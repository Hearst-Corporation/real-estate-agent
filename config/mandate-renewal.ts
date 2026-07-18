/**
 * RENOUVELLEMENT DES MANDATS — seuils et bornes (W4).
 * =================================================================
 * Constantes nommées de l'analyse de renouvellement. Zéro magic number dans la
 * logique : tout paramètre chiffré vit ici (surchargeable via env).
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Fenêtre (jours) avant expiration d'un mandat pour l'inclure dans les mandats
 * « à renouveler ». On réutilise la fenêtre radar par défaut mais on la laisse
 * surchargeable indépendamment.
 */
export const RENEWAL_WINDOW_DAYS = envInt(
  "MANDATE_RENEWAL_WINDOW_DAYS",
  envInt("RADAR_MANDATE_EXPIRY_WINDOW_DAYS", 30),
);

/** Nombre max de mandats analysés en une passe (borne dure sur la liste). */
export const RENEWAL_LIST_LIMIT = envInt("MANDATE_RENEWAL_LIST_LIMIT", 50);

/** Nombre max de lignes lues par bloc d'activité (aucune liste sans LIMIT). */
export const RENEWAL_ACTIVITY_LIMIT = envInt("MANDATE_RENEWAL_ACTIVITY_LIMIT", 200);

/**
 * Écart relatif (fraction) entre prix affiché et valeur de marché estimée
 * au-delà duquel on recommande un AJUSTEMENT DE PRIX plutôt qu'un simple
 * renouvellement. 0.05 = 5 %.
 */
export const RENEWAL_PRICE_GAP_RATIO = (() => {
  const raw = process.env.MANDATE_RENEWAL_PRICE_GAP_RATIO;
  if (!raw) return 0.05;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.05;
})();

/**
 * Seuil de visites réalisées SANS retour positif (offre probable / très
 * intéressé) au-delà duquel on recommande un CHANGEMENT DE STRATÉGIE.
 */
export const RENEWAL_STALE_VISITS_THRESHOLD = envInt(
  "MANDATE_RENEWAL_STALE_VISITS_THRESHOLD",
  3,
);
