/**
 * lib/invest/ports/identity-registry.ts — IdentityRegistryPort (ONCHAINID).
 *
 * Identité on-chain soulbound (non transférable), trusted issuer = KYC provider.
 * Pré-requis au mint (canTransfer/isVerified côté token). Invariants : I5 (ERC-3643
 * permissionné), I8 (claim idempotent par wallet). Aucune impl, aucun import SDK.
 */

import type { IdempotencyKey } from "../shared/types";

/** Adresse EVM (validée `^0x[a-fA-F0-9]{40}$` côté DB). */
export type EvmAddress = string;

export interface IdentityRegistryPort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /**
   * Claim une identité ONCHAINID pour un wallet (soulbound).
   * Idempotent par `idempotencyKey` (I8, ex. onchainid:{wallet}).
   */
  claimIdentity(input: {
    wallet: EvmAddress;
    kycCaseId: string;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ onchainIdAddress: EvmAddress }>;

  /** Vérifie qu'un wallet possède une identité vérifiée (gate pré-mint). */
  isVerified(wallet: EvmAddress): Promise<boolean>;

  /** Adresse ONCHAINID associée à un wallet, ou null si non claim. */
  getIdentity(wallet: EvmAddress): Promise<EvmAddress | null>;
}
