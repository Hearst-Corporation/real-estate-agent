/**
 * VALEUR IMMOBILIÈRE ÉVOLUTIVE — seuils et bornes (W6).
 * =================================================================
 * Constantes nommées de la détection de variation de valeur. Zéro magic number
 * dans la logique : tout paramètre chiffré vit ici (surchargeable via env).
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Variation relative minimale (en %, valeur absolue) entre la 1re et la
 * dernière estimation d'un bien pour qu'elle soit jugée « significative ».
 */
export const SIGNIFICANT_PCT = envFloat("VALUE_EVOLUTION_SIGNIFICANT_PCT", 5);

/**
 * Variation absolue minimale (en €) requise en plus du seuil %. Évite de lever
 * un signal sur un tout petit bien où 5 % = quelques milliers d'euros.
 */
export const SIGNIFICANT_MIN_EUR = envInt("VALUE_EVOLUTION_SIGNIFICANT_MIN_EUR", 5000);

/**
 * Nombre minimum d'estimations distinctes (dans le temps) pour tracer une
 * évolution et détecter une variation. En dessous : pas d'historique exploitable.
 */
export const MIN_POINTS = envInt("VALUE_EVOLUTION_MIN_POINTS", 2);

/** Nombre max de biens (séries) retournés par l'API (borne dure). */
export const SERIES_LIMIT = envInt("VALUE_EVOLUTION_SERIES_LIMIT", 100);

/** Nombre max d'estimations lues pour reconstruire l'historique (borne dure). */
export const READ_LIMIT = envInt("VALUE_EVOLUTION_READ_LIMIT", 1000);
