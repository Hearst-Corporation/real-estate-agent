/**
 * lib/invest/adapters/chain.indexer.ts — Adaptateur ChainPort → indexer (RPC/webhook).
 *
 * I1 : LECTURE SEULE de la chaîne (réconciliation §5.2, JAMAIS source de vérité).
 * Fail-soft (I7) : env lue paresseusement via envPresent.
 *
 * `verifyWebhook` porte la VRAIE logique HMAC-SHA256 (corps brut, TIMING-SAFE) avec
 * `CHAIN_INDEXER_WEBHOOK_SECRET` — c'est la garde du webhook `/api/invest/webhooks/chain`
 * (Pattern B). Les lectures RPC on-chain (`getConfirmations/getTokenBalance/getEvents`)
 * restent des stubs fail-soft : AUCUN SDK chaîne (viem/ethers) n'est importé et AUCUN
 * appel mainnet n'est émis (cadre Jalon 1 : aucun closing réel sur chaîne). Sans
 * indexer branché, la réconciliation tombe en `legal_only` (DEEP seul) côté domaine.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { envPresent } from "../../providers/types";
import { ProviderUnavailableError, NotImplementedError } from "../shared/errors";
import type { ChainPort } from "../ports/chain";

const PROVIDER = "chain-indexer";

export function chainIndexerIsConfigured(): boolean {
  // I7 : env lue à l'appel, jamais au module load.
  return envPresent("CHAIN_RPC_URL", "CHAIN_INDEXER_WEBHOOK_SECRET");
}

/** Le webhook peut être signé même si le RPC de lecture n'est pas (encore) câblé. */
function webhookSecretPresent(): boolean {
  return envPresent("CHAIN_INDEXER_WEBHOOK_SECRET");
}

export const chainIndexerAdapter: ChainPort = {
  isConfigured: chainIndexerIsConfigured,

  async getConfirmations() {
    // Lecture RPC on-chain non câblée au Jalon 1 (aucun SDK chaîne, aucun mainnet).
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

  /**
   * Vérifie la signature HMAC-SHA256 d'un webhook indexer (Pattern B). PUR côté
   * crypto, comparaison TIMING-SAFE. Le header peut être préfixé `sha256=`.
   * Secret absent / signature absente / longueur incohérente → false (pas de throw
   * hors absence totale de configuration webhook).
   */
  verifyWebhook(req) {
    if (!webhookSecretPresent()) throw new ProviderUnavailableError(PROVIDER);
    const secret = process.env.CHAIN_INDEXER_WEBHOOK_SECRET;
    if (!secret || !req.signature) return false;
    const provided = req.signature.startsWith("sha256=")
      ? req.signature.slice("sha256=".length)
      : req.signature;
    const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
    let providedBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      providedBuf = Buffer.from(provided, "hex");
      expectedBuf = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  },
};
