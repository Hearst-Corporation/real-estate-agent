/**
 * lib/invest/adapters/chain.indexer.ts — Adaptateur ChainPort → indexer (STUB).
 *
 * Fail-soft (I7). I1 : lecture seule de la chaîne (réconciliation, jamais source
 * de vérité). Aucun import SDK chaîne. Corps réseau au Jalon 1.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { ChainPort } from "../ports/chain";

const PROVIDER = "chain-indexer";

export function chainIndexerIsConfigured(): boolean {
  return envPresent("CHAIN_RPC_URL", "CHAIN_INDEXER_WEBHOOK_SECRET");
}

export const chainIndexerAdapter: ChainPort = {
  isConfigured: chainIndexerIsConfigured,

  async getConfirmations() {
    if (!chainIndexerIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("chain.indexer.getConfirmations — Jalon 1");
  },

  async getTokenBalance() {
    if (!chainIndexerIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("chain.indexer.getTokenBalance — Jalon 1");
  },

  async getEvents() {
    if (!chainIndexerIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("chain.indexer.getEvents — Jalon 1");
  },

  verifyWebhook() {
    if (!chainIndexerIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("chain.indexer.verifyWebhook — Jalon 1");
  },
};
