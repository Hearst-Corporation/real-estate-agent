/**
 * lib/invest/adapters/kyc.sumsub.ts — Adaptateur KycPort → Sumsub (STUB fail-soft).
 *
 * Pattern providers existant : env lue paresseusement (I7), isConfigured() via
 * envPresent, throw ProviderUnavailableError si non configuré. Corps « configuré »
 * = NotImplementedError (câblage réseau au Jalon 1). Aucun appel réseau ici.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { KycPort, KycDomainEvent } from "../ports/kyc";

const PROVIDER = "sumsub";

export function sumsubIsConfigured(): boolean {
  // I7 : env lue à l'appel, jamais au module load.
  return envPresent("SUMSUB_APP_TOKEN", "SUMSUB_SECRET_KEY");
}

export const sumsubKycAdapter: KycPort = {
  isConfigured: sumsubIsConfigured,

  async startCase() {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("kyc.sumsub.startCase — Jalon 1");
  },

  verifyWebhook() {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("kyc.sumsub.verifyWebhook — Jalon 1");
  },

  parseEvent(): KycDomainEvent {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("kyc.sumsub.parseEvent — Jalon 1");
  },
};
