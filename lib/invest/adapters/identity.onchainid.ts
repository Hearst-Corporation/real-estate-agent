/**
 * lib/invest/adapters/identity.onchainid.ts — Adaptateur IdentityRegistryPort → ONCHAINID (STUB).
 *
 * Fail-soft (I7). Aucun import viem/ethers (non installés) ; le câblage on-chain
 * passera par le signer custodial (ADR-006) au Jalon 1.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { IdentityRegistryPort } from "../ports/identity-registry";

const PROVIDER = "onchainid";

export function onchainIdIsConfigured(): boolean {
  return envPresent("ONCHAINID_REGISTRY_ADDRESS", "ONCHAINID_ISSUER_KEY");
}

export const onchainIdAdapter: IdentityRegistryPort = {
  isConfigured: onchainIdIsConfigured,

  async claimIdentity() {
    if (!onchainIdIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("identity.onchainid.claimIdentity — Jalon 1");
  },

  async isVerified() {
    if (!onchainIdIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("identity.onchainid.isVerified — Jalon 1");
  },

  async getIdentity() {
    if (!onchainIdIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("identity.onchainid.getIdentity — Jalon 1");
  },
};
