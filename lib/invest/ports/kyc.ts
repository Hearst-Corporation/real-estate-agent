/**
 * lib/invest/ports/kyc.ts — KycPort (KYC/AML, ex. Sumsub).
 *
 * Le domaine ne connaît QUE ce port (ADR-008 : Sumsub→Onfido sans toucher au
 * métier). Aucune impl ici. Invariants : I7 (env paresseuse, jamais client),
 * I8 (idempotence par externalRef), Pattern B (webhook signé + dédup).
 */

import type { IdempotencyKey } from "../shared/types";

/** Niveau de vérification (aligné inv_kyc_cases.level : standard | enhanced). */
export type KycLevel = "standard" | "enhanced";

/** Statut KYC normalisé (aligné inv_kyc_cases.status). */
export type KycStatus = "pending" | "approved" | "rejected" | "expired" | "review";

/** Événement KYC normalisé issu d'un webhook (Pattern B). */
export interface KycDomainEvent {
  providerCaseId: string;
  status: KycStatus;
  /** Origine des fonds vérifiée (obligation LCB-FT, cf. ⑧). */
  fundOriginVerified: boolean;
  /** Id provider unique pour la dédup (`provider_event_id`). */
  providerEventId: string;
}

export interface KycPort {
  /** Env lue paresseusement (I7). false au lancement si SUMSUB_* absents. */
  isConfigured(): boolean;

  /**
   * Démarre un cas KYC. Idempotent par `idempotencyKey` (I8, ex. kyc:{userId}).
   * @returns identifiant provider + token SDK pour le front.
   */
  startCase(input: {
    investorId: string;
    externalRef: string;
    level: KycLevel;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ providerCaseId: string; sdkToken: string }>;

  /** Vérifie la signature HMAC d'un webhook entrant (Pattern B). */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;

  /** Parse un webhook vérifié en événement de domaine normalisé. */
  parseEvent(rawBody: string): KycDomainEvent;
}
