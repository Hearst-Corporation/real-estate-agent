/**
 * lib/invest/adapters/stablecoin.circle-monerium.ts — Adaptateur StablecoinPort → CASP (STUB).
 *
 * Fail-soft (I7). I6 : refuse tout asset non whitelisté (EURC/EURe), JAMAIS USDT.
 * La garde d'asset est appliquée AVANT toute logique réseau (et même au stade stub).
 */

import { envPresent } from "../../providers/types";
import {
  ProviderUnavailableError,
  NotImplementedError,
  InvariantViolationError,
} from "../shared/errors";
import type { StablecoinPort } from "../ports/stablecoin";
import { isAllowedStablecoinAsset } from "../ports/stablecoin";

const PROVIDER = "stablecoin-casp";

export function stablecoinIsConfigured(): boolean {
  return envPresent("CASP_API_URL", "CASP_API_KEY", "CASP_WEBHOOK_SECRET");
}

export const circleMoneriumAdapter: StablecoinPort = {
  isConfigured: stablecoinIsConfigured,

  async initiateRamp(input) {
    if (!stablecoinIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    // I6 — whitelist d'asset matérialisée : USDT (ou tout autre) refusé.
    if (!isAllowedStablecoinAsset(input.asset)) {
      throw new InvariantViolationError("I6", `asset stablecoin non autorisé: ${input.asset}`);
    }
    throw new NotImplementedError("stablecoin.circle-monerium.initiateRamp — Jalon 1");
  },

  verifyWebhook() {
    if (!stablecoinIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("stablecoin.circle-monerium.verifyWebhook — Jalon 1");
  },
};
