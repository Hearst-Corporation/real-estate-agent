/**
 * lib/db/schema-missing.ts — Détection CANONIQUE d'un schéma pas encore migré.
 *
 * Source unique pour « cette table/colonne/fonction n'existe pas sur gpu1 » →
 * l'appelant dégrade honnêtement (UNAVAILABLE / 503), il ne renvoie pas un 500.
 * Avant consolidation, ce prédicat existait en 9 copies divergentes (routes +
 * libs) ; toute modification devait être répliquée à la main. Ici : un seul
 * endroit, trois familles de codes explicitement nommées.
 *
 * Aucune dépendance, aucun I/O : utilisable côté route, lib ou test.
 */

/** SQLSTATE Postgres : relation absente (42P01), colonne absente (42703). */
export const PG_SCHEMA_MISSING_CODES = ["42P01", "42703"] as const;

/**
 * Erreurs PostgREST : table absente du cache de schéma (PGRST205), fonction
 * RPC absente (PGRST202). PostgREST les renvoie à la place du SQLSTATE brut.
 */
export const POSTGREST_MISSING_CODES = ["PGRST205", "PGRST202"] as const;

/** Table absente, quelle que soit la couche qui l'a signalé. */
export const MISSING_TABLE_CODES = ["42P01", ...POSTGREST_MISSING_CODES] as const;

/** Toute forme de « schéma non migré » (relation, colonne, fonction). */
export const SCHEMA_OR_TABLE_MISSING_CODES = [
  ...PG_SCHEMA_MISSING_CODES,
  ...POSTGREST_MISSING_CODES,
] as const;

/**
 * Accepte indifféremment le code brut ou l'objet d'erreur qui le porte —
 * les deux formes coexistaient dans les copies remplacées, on les garde
 * toutes les deux pour ne changer aucun comportement d'appel.
 */
export type ErrorCodeLike = string | { code?: string | null } | null | undefined;

function codeOf(e: ErrorCodeLike): string {
  if (e == null) return "";
  return String((typeof e === "string" ? e : e.code) ?? "");
}

/** Relation OU colonne absente côté Postgres (42P01 / 42703). */
export function isSchemaMissing(e: ErrorCodeLike): boolean {
  return (PG_SCHEMA_MISSING_CODES as readonly string[]).includes(codeOf(e));
}

/** Table absente : SQLSTATE 42P01 ou signalement PostgREST (PGRST205/202). */
export function isMissingTable(e: ErrorCodeLike): boolean {
  return (MISSING_TABLE_CODES as readonly string[]).includes(codeOf(e));
}

/** Union des deux familles — « le schéma n'est pas à jour », tous cas confondus. */
export function isSchemaOrTableMissing(e: ErrorCodeLike): boolean {
  return (SCHEMA_OR_TABLE_MISSING_CODES as readonly string[]).includes(codeOf(e));
}
