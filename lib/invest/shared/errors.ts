/**
 * lib/invest/shared/errors.ts — Erreurs typées du domaine invest.
 *
 * Réutilise ProviderUnavailableError du socle providers (fail-soft adaptateurs).
 * Ajoute les erreurs métier propres aux invariants I1..I10.
 */

import { ProviderUnavailableError } from "../../providers/types";

export { ProviderUnavailableError };

/** Racine de toutes les erreurs métier du domaine invest. */
export class DomainError extends Error {
  /** Code stable exposé en API (`{ error, code }`). */
  readonly code: string;
  constructor(message: string, code = "domain_error") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/** Fonctionnalité câblée au Jalon 1 (squelette : corps non implémenté). */
export class NotImplementedError extends DomainError {
  constructor(what: string) {
    super(`Non implémenté (Jalon 1) : ${what}`, "not_implemented");
    this.name = "NotImplementedError";
  }
}

/**
 * Conflit d'idempotence (I8). Levée quand une clé déterministe existe déjà
 * avec un hash de corps différent → la commande ne doit JAMAIS être rejouée.
 */
export class IdempotencyConflictError extends DomainError {
  readonly idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super(`Clé d'idempotence en conflit : ${idempotencyKey}`, "idempotency_conflict");
    this.name = "IdempotencyConflictError";
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Action bloquée par la conformité (LCB-FT, suitability, plafond, KYC, sanctions).
 * Jamais de blocage silencieux (cf. ⑧) : motif explicite + escalade possible.
 */
export class ComplianceBlockedError extends DomainError {
  readonly reason: string;
  constructor(reason: string) {
    super(`Action bloquée par la conformité : ${reason}`, "compliance_blocked");
    this.name = "ComplianceBlockedError";
    this.reason = reason;
  }
}

/**
 * Violation d'un invariant d'architecture (I1..I10). Doit faire casser un test
 * ou une requête — jamais avalée. Ex : tenter un settlement sans deal (I2),
 * un rail non whitelisté (I6), un standard de token interdit (I5).
 */
export class InvariantViolationError extends DomainError {
  /** Identifiant de l'invariant violé, ex. "I2", "I5". */
  readonly invariant: string;
  constructor(invariant: string, detail: string) {
    super(`Violation invariant ${invariant} : ${detail}`, "invariant_violation");
    this.name = "InvariantViolationError";
    this.invariant = invariant;
  }
}
