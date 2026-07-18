/**
 * lib/value-evolution/types.ts — modèle de la VALEUR IMMOBILIÈRE ÉVOLUTIVE (W6).
 *
 * On reconstruit l'historique de valeur d'un bien à partir des estimations
 * successives (`estimations`), sans table dédiée (dérivation LIVE). Une variation
 * significative (seuil configurable) génère une opportunité de relance propriétaire
 * — signal pour le Centre d'actions + brouillon owner (outbox DRAFT), jamais d'envoi.
 *
 * Aucune donnée fabriquée : chaque point = une estimation réelle, chaque valeur =
 * un chiffre lu en base (recommended_price / market_value). Types purs, réutilisables
 * serveur + client (zéro dépendance React, zéro I/O).
 */

/** Sous-ensemble d'une ligne `estimations` nécessaire à l'évolution de valeur. */
export type EstimationRow = {
  id: string;
  property_id: string | null;
  owner_lead_id: string | null;
  /** Valeur retenue (priorité recommended_price → market_value). */
  recommended_price: number | null;
  market_value: number | null;
  /** JSON métier ; on n'y lit QUE l'adresse pour regrouper les biens sans property_id. */
  property: unknown;
  valued_at: string | null;
  created_at: string;
};

/** Un point d'historique de valeur = une estimation datée avec une valeur connue. */
export type ValuePoint = {
  estimationId: string;
  /** Date effective (valued_at si présent, sinon created_at) — ISO. */
  at: string;
  /** Valeur en euros (jamais null : les points sans valeur sont écartés en amont). */
  value: number;
  /** Source du chiffre, pour l'explicabilité. */
  source: "recommended_price" | "market_value";
};

/** Nature de la variation entre le premier et le dernier point d'une série. */
export type VariationDirection = "up" | "down" | "flat";

/** Variation détectée sur une série (déterministe, explicable). */
export type ValueVariation = {
  direction: VariationDirection;
  /** Delta absolu en euros (dernier − premier ; signé). */
  deltaEur: number;
  /** Variation relative en % (delta / premier × 100 ; signée). */
  deltaPct: number;
  /** true si |deltaPct| ≥ seuil % ET |deltaEur| ≥ seuil € (les deux requis). */
  significant: boolean;
};

/** Série d'évolution de valeur d'un bien (identifié par property_id ou adresse). */
export type ValueSeries = {
  /** Clé stable de regroupement : `prop:<uuid>` ou `addr:<adresse normalisée>`. */
  key: string;
  /** property_id si connu, sinon null (regroupement par adresse). */
  propertyId: string | null;
  /** owner_lead_id du point le plus récent (cible de relance), sinon null. */
  ownerLeadId: string | null;
  /** Libellé lisible (adresse), pour l'UI. */
  label: string;
  /** Points triés chronologiquement (ancien → récent), ≥ 1. */
  points: ValuePoint[];
  /** Variation entre premier et dernier point (null si < MIN_POINTS). */
  variation: ValueVariation | null;
};

/** Brouillon de relance proposé pour un bien dont la valeur a bougé. */
export type RelanceOpportunity = {
  seriesKey: string;
  propertyId: string | null;
  ownerLeadId: string | null;
  label: string;
  variation: ValueVariation;
  /** Sujet proposé pour le brouillon email. */
  subject: string;
  /** Corps proposé (texte brut, à valider humainement — jamais envoyé auto). */
  body: string;
};

/** Résultat de lecture de l'historique (dégradation honnête si schéma absent). */
export type BuildResult =
  | { ok: true; series: ValueSeries[] }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error" };

/** Code PostgREST « relation/colonne absente » → table pas encore migrée. */
export const SCHEMA_MISSING_CODES = ["42P01", "42703"] as const;

export function isSchemaMissing(code: string | undefined | null): boolean {
  return (SCHEMA_MISSING_CODES as readonly string[]).includes(String(code ?? ""));
}
