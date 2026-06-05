/**
 * lib/invest/ports/tokenization.ts — TokenizationPort (T-REX / ERC-3643 + DEEP registrar).
 *
 * MIROIR on-chain de la cap table off-chain (I1 : DEEP = source de vérité, le
 * token suit). Interface modélisée sur T-REX (I5 : ERC-3643 permissionné, JAMAIS
 * ERC-4626/ERC-20 libre). Clés de signature en custody/KMS, jamais dans l'app
 * (ADR-006). I8 : mint/burn/transfer idempotents. Aucun import viem/ethers.
 */

import type { IdempotencyKey } from "../shared/types";
import type { EvmAddress } from "./identity-registry";

/** Standards de token AUTORISÉS (aligné inv_token_mints.token_standard). I5. */
export const ALLOWED_TOKEN_STANDARDS = ["ERC-3643", "ERC-1400"] as const;
export type TokenStandard = (typeof ALLOWED_TOKEN_STANDARDS)[number];

/** I5 : refuse explicitement tout standard non permissionné (ex. ERC-4626/20). */
export function isAllowedTokenStandard(standard: string): standard is TokenStandard {
  return (ALLOWED_TOKEN_STANDARDS as readonly string[]).includes(standard);
}

/** Résultat d'une opération on-chain (reflet, jamais source de droit — I1). */
export interface TokenOpResult {
  txHash: string;
  /** Statut aligné inv_token_mints.status. */
  status: "pending" | "submitted" | "confirmed" | "failed" | "reverted";
}

export interface TokenizationPort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /**
   * Mint le miroir on-chain APRÈS inscription DEEP (I1, étape 3 de la saga).
   * Idempotent par `idempotencyKey` (I8, ex. mint:{subscriptionId}).
   */
  mint(input: {
    contract: EvmAddress;
    to: EvmAddress;
    units: number;
    idempotencyKey: IdempotencyKey;
  }): Promise<TokenOpResult>;

  /** Burn au remboursement/exit (extinction du miroir). Idempotent (I8). */
  burn(input: {
    contract: EvmAddress;
    from: EvmAddress;
    units: number;
    idempotencyKey: IdempotencyKey;
  }): Promise<TokenOpResult>;

  /**
   * Transfert forcé (administratif, ex. correction/saisie légale). Idempotent (I8).
   * Reste subordonné au DEEP (I1) : reflète une décision déjà inscrite off-chain.
   */
  forcedTransfer(input: {
    contract: EvmAddress;
    from: EvmAddress;
    to: EvmAddress;
    units: number;
    idempotencyKey: IdempotencyKey;
  }): Promise<TokenOpResult>;

  /** Gèle le contrat (T-REX pause) — ex. anomalie chaîne>DEEP (§5.2). Idempotent. */
  pause(input: { contract: EvmAddress; idempotencyKey: IdempotencyKey }): Promise<TokenOpResult>;

  /** Pré-check transfert : compliance + identités vérifiées (lecture, I5). */
  canTransfer(input: { contract: EvmAddress; from: EvmAddress; to: EvmAddress; units: number }): Promise<boolean>;

  /** Wallet vérifié dans l'identity registry du contrat (lecture, gate mint). */
  isVerified(input: { contract: EvmAddress; wallet: EvmAddress }): Promise<boolean>;

  /**
   * Inscription DEEP (source de vérité juridique) — étape 2 de la saga, AVANT mint.
   * NB : opération registrar off-chain, mais portée par le port tokenisation
   * (le partenaire Tokeny opère DEEP + T-REX). Idempotent par `idempotencyKey`.
   */
  inscribeDeep(input: {
    securityRef: string;
    holderWallet: EvmAddress;
    units: number;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ deepRef: string }>;
}
