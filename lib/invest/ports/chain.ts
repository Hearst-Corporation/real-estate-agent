/**
 * lib/invest/ports/chain.ts — ChainPort (RPC / indexer, ex. Alchemy/QuickNode).
 *
 * LECTURE seule de la chaîne (I1 : aucune écriture de propriété depuis un event
 * chain ; sert la réconciliation §5.2). Confirmations ≥ N avant traitement.
 * Aucun import SDK chaîne — interface pure.
 */

import type { EvmAddress } from "./identity-registry";

/** Event on-chain indexé (aligné inv_chain_events / I1 unique tx_hash+log_index). */
export interface IndexedChainEvent {
  contractAddress: EvmAddress;
  txHash: string;
  logIndex: number;
  eventName: string;
  blockNumber: number;
  payload: Record<string, unknown>;
}

export interface ChainPort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /** Nb de confirmations d'une transaction (gate : ≥ N avant traitement). */
  getConfirmations(txHash: string): Promise<number>;

  /** Solde ERC-3643 d'un wallet (reflet on-chain, jamais source de vérité — I1). */
  getTokenBalance(input: { contract: EvmAddress; wallet: EvmAddress }): Promise<number>;

  /** Lit les events d'un contrat depuis un bloc (réconciliation §5.2). */
  getEvents(input: { contract: EvmAddress; fromBlock: number }): Promise<IndexedChainEvent[]>;

  /** Vérifie la signature HMAC d'un webhook indexer (Pattern B). */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;
}
