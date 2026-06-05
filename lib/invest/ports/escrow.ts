/**
 * lib/invest/ports/escrow.ts — EscrowPort (séquestre tiers EMI/notaire).
 *
 * I2/I4 : la plateforme ne détient JAMAIS les fonds. Compte séquestre PAR DEAL.
 * Release UNIQUEMENT au closing (conditions suspensives). Refund intégral si
 * échec, sans pénalité (ECSP). I8 : chaque mouvement idempotent. ADR-003.
 *
 * Aucun « deposit balance », aucun solde plateforme — par construction du port.
 */

import type { Eur, IdempotencyKey } from "../shared/types";

/** Fournisseur de séquestre (aligné inv_escrow_movements.escrow_provider). */
export type EscrowProvider = "notaire" | "carpa" | "emi" | "psp_segregated";

/** Référence d'un compte séquestre rattaché à un deal (I2 : deal_id requis). */
export interface EscrowAccountRef {
  dealId: string; // I2 — JAMAIS null : pas de séquestre « global »
  provider: EscrowProvider;
  externalRef: string; // IBAN masqué / id EMI
}

export interface EscrowPort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /**
   * Instruit un versement investisseur → séquestre (inflow `deposit`).
   * I2 : exige un subscriptionId rattaché à un deal — pas de dépôt libre.
   * Idempotent par `idempotencyKey` (I8, ex. escrow:{subscriptionId}).
   */
  createDepositInstruction(input: {
    account: EscrowAccountRef;
    subscriptionId: string; // I2 — toujours lié à une souscription
    amountEur: Eur;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ providerRef: string; instructions: Record<string, string> }>;

  /**
   * Libère les fonds séquestre → SPV au CLOSING uniquement (outflow `release_to_spv`).
   * I4 : irréversible — gardé par les conditions suspensives en amont (saga).
   * Idempotent par `idempotencyKey` (I8).
   */
  release(input: {
    account: EscrowAccountRef;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ providerRef: string }>;

  /**
   * Rembourse l'investisseur si échec/annulation (outflow `refund`).
   * Intégral, sans pénalité (ECSP). Idempotent par `idempotencyKey` (I8).
   */
  refund(input: {
    account: EscrowAccountRef;
    subscriptionId: string;
    amountEur: Eur;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ providerRef: string }>;

  /** Vérifie la signature HMAC d'un webhook escrow (Pattern B). */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;
}
