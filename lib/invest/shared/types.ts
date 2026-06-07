/**
 * lib/invest/shared/types.ts — Types transverses du domaine invest.
 *
 * Briques partagées par les 9 bounded contexts. Aucune I/O, aucun import lourd.
 */

/** Identifiant de tenant (multi-tenant strict, I9). Défaut projet : 'real-estate-agent'. */
export type TenantId = string;

/** Tenant racine du projet (cf. migration 0015 inv_tenants). */
export const DEFAULT_TENANT_ID: TenantId = "real-estate-agent";

/**
 * Rôles d'acteur (cf. C4 niveau 1 §2.1). Gouvernent les gardes de route.
 * Note : la colonne SQL `inv_audit_log.actor_role` utilise une granularité
 * technique distincte ('user','admin','service','system','operator') ; ici on
 * modélise les rôles MÉTIER côté domaine.
 */
export type ActorRole = "investor" | "operator" | "compliance" | "admin" | "auditor";

/**
 * Montant en euros stocké en CENTIMES (entier) pour éviter les flottants.
 * I2 : un Eur ne représente JAMAIS un solde de plateforme — toujours rattaché
 * à un deal/souscription précis. Conversion DB : numeric(16,2) euros ↔ centimes.
 */
export type Eur = number;

/** Euros (numeric DB) → centimes (Eur domaine). Arrondi au centime. */
export function toCents(euros: number): Eur {
  return Math.round(euros * 100);
}

/** Centimes (Eur domaine) → euros (numeric DB). */
export function toEuros(cents: Eur): number {
  return cents / 100;
}

/** Page de résultats générique (pagination par curseur ou offset). */
export interface Paginated<T> {
  items: T[];
  total: number;
  /** Curseur opaque pour la page suivante (null = fin). */
  nextCursor: string | null;
}

/**
 * Résultat typé sans throw (style Rust). Utilisé là où le domaine veut exposer
 * une transition refusée sans lever d'exception (ex. machine à états).
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Clé d'idempotence déterministe (I8), ex. `mint:{subscriptionId}`. */
export type IdempotencyKey = string;
