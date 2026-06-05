/**
 * lib/invest/tokenization/types.ts — ⑥ Tokenization (MIROIR) : types de domaine.
 *
 * NB : contexte métier distinct du PORT du même nom (lib/invest/ports/tokenization).
 * Le port = interface vers Tokeny ; ce contexte = état persisté du miroir on-chain.
 *
 * I1 : MIROIR, jamais source de vérité (suit ④). I5 : ERC-3643/1400 seulement.
 * Alignés sur les migrations 0018/0021 :
 *   - inv_token_mints.operation : mint|burn|transfer|forced_transfer|freeze|unfreeze
 *   - inv_token_mints.status : pending|submitted|confirmed|failed|reverted
 *   - inv_token_mints.chain : polygon|base|ethereum|permissioned
 *   - inv_token_mints.token_standard : ERC-3643|ERC-1400 (jamais 20/4626)
 *   - inv_reconciliation_runs.result : in_sync|mint_missing|chain_exceeds_deep|
 *                                      transfer_unmirrored|error
 */

import type { TenantId } from "../shared/types";

/** Opération on-chain (aligné inv_token_mints.operation). */
export type TokenOperation = "mint" | "burn" | "transfer" | "forced_transfer" | "freeze" | "unfreeze";

/** Statut on-chain (aligné inv_token_mints.status). */
export type TokenOpStatus = "pending" | "submitted" | "confirmed" | "failed" | "reverted";

/** Chaîne EVM autorisée (aligné inv_token_mints.chain). */
export type Chain = "polygon" | "base" | "ethereum" | "permissioned";

/** Standard de token (aligné inv_token_mints.token_standard). I5. */
export type MirrorTokenStandard = "ERC-3643" | "ERC-1400";

/**
 * Résultat de réconciliation (aligné inv_reconciliation_runs.result — §5.2).
 * `chain_exceeds_deep` = ANOMALIE GRAVE → pause + escalade (DEEP prime toujours).
 */
export type ReconciliationResult =
  | "in_sync"
  | "mint_missing"
  | "chain_exceeds_deep"
  | "transfer_unmirrored"
  | "error";

/** Opération de token persistée (vue domaine, sous-ensemble inv_token_mints). */
export interface TokenMint {
  id: string;
  tenantId: TenantId;
  dealId: string;
  operation: TokenOperation;
  units: number;
  chain: Chain;
  tokenStandard: MirrorTokenStandard;
  status: TokenOpStatus;
  txHash: string | null;
  idemKey: string | null; // I8
}

/** Diff de réconciliation pour un wallet (attendu DEEP vs observé chaîne). */
export interface ReconciliationDiff {
  walletAddress: string;
  expectedUnits: number; // SUM(inv_holdings) — source de vérité
  onchainUnits: number; // balances ERC-3643
  result: ReconciliationResult;
}
