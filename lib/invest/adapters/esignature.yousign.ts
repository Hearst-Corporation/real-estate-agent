/**
 * lib/invest/adapters/esignature.yousign.ts — Adaptateur ESignaturePort → Yousign (STUB).
 *
 * Fail-soft (I7). Signature eIDAS opposable (③). Corps réseau au Jalon 1.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { ESignaturePort, ESignDomainEvent } from "../ports/esignature";

const PROVIDER = "yousign";

export function yousignIsConfigured(): boolean {
  return envPresent("YOUSIGN_API_KEY", "YOUSIGN_WEBHOOK_SECRET");
}

export const yousignAdapter: ESignaturePort = {
  isConfigured: yousignIsConfigured,

  async requestSignature() {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("esignature.yousign.requestSignature — Jalon 1");
  },

  verifyWebhook() {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("esignature.yousign.verifyWebhook — Jalon 1");
  },

  parseEvent(): ESignDomainEvent {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("esignature.yousign.parseEvent — Jalon 1");
  },
};
