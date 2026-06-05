/**
 * lib/invest/adapters/tokenization.tokeny.ts — Adaptateur TokenizationPort → Tokeny T-REX (STUB).
 *
 * Fail-soft (I7). I1 : miroir on-chain du DEEP. I5 : ERC-3643 uniquement.
 * ADR-006 : signature via custody/KMS, jamais de clé privée dans l'app.
 * Aucun import viem/ethers (non installés). Corps réseau au Jalon 1.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { TokenizationPort } from "../ports/tokenization";

const PROVIDER = "tokeny";

export function tokenyIsConfigured(): boolean {
  return envPresent("TOKENY_API_URL", "TOKENY_API_KEY", "TOKENY_CUSTODY_SIGNER");
}

export const tokenyAdapter: TokenizationPort = {
  isConfigured: tokenyIsConfigured,

  async mint() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.mint — Jalon 1");
  },

  async burn() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.burn — Jalon 1");
  },

  async forcedTransfer() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.forcedTransfer — Jalon 1");
  },

  async pause() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.pause — Jalon 1");
  },

  async canTransfer() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.canTransfer — Jalon 1");
  },

  async isVerified() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.isVerified — Jalon 1");
  },

  async inscribeDeep() {
    if (!tokenyIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("tokenization.tokeny.inscribeDeep — Jalon 1");
  },
};
