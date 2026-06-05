/**
 * lib/invest/adapters/escrow.emi-notaire.ts — Adaptateur EscrowPort → EMI/notaire (STUB).
 *
 * Fail-soft (I7). I4 : la plateforme ne détient jamais les fonds — cet adaptateur
 * parle à un tiers séquestre. Corps réseau au Jalon 1.
 */

import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { EscrowPort } from "../ports/escrow";

const PROVIDER = "escrow-emi-notaire";

export function escrowIsConfigured(): boolean {
  return envPresent("ESCROW_API_URL", "ESCROW_API_KEY", "ESCROW_WEBHOOK_SECRET");
}

export const emiNotaireEscrowAdapter: EscrowPort = {
  isConfigured: escrowIsConfigured,

  async createDepositInstruction() {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("escrow.emi-notaire.createDepositInstruction — Jalon 1");
  },

  async release() {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("escrow.emi-notaire.release — Jalon 1");
  },

  async refund() {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("escrow.emi-notaire.refund — Jalon 1");
  },

  verifyWebhook() {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    throw new NotImplementedError("escrow.emi-notaire.verifyWebhook — Jalon 1");
  },
};
