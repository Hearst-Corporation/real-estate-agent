/**
 * lib/invest/adapters/escrow.emi-notaire.ts — Adaptateur EscrowPort → EMI/notaire.
 *
 * I2/I4 : la plateforme ne détient JAMAIS les fonds — cet adaptateur parle à un
 * TIERS séquestre (EMI cantonnée / notaire / CARPA) via son API. Compte séquestre
 * PAR DEAL (account.dealId requis). Aucun « solde plateforme » par construction.
 *
 * VRAIE logique d'intégration avec `fetch` natif (AUCUN SDK npm) :
 *   - createDepositInstruction : ouvre une instruction de versement
 *     investisseur → séquestre (inflow `deposit`), référencée par la souscription
 *     (idempotence applicative I8 via l'en-tête Idempotency-Key).
 *   - release  : libère séquestre → SPV au CLOSING (outflow `release_to_spv`).
 *   - refund   : rembourse l'investisseur (outflow `refund`), intégral, sans pénalité.
 *   - verifyWebhook : HMAC-SHA256 du corps BRUT avec ESCROW_WEBHOOK_SECRET, TIMING-SAFE.
 *
 * Fail-soft (I7) : env lue paresseusement ; isConfigured() via envPresent. Clé
 * absente → throw ProviderUnavailableError (la route renvoie 502, AUCUN appel
 * réseau). On ne logue jamais la clé.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { envPresent } from "../../providers/types";
import { ProviderUnavailableError } from "../shared/errors";
import type { EscrowPort } from "../ports/escrow";

const PROVIDER = "escrow-emi-notaire";
const DEFAULT_TIMEOUT_MS = 12_000;

export function escrowIsConfigured(): boolean {
  // I7 : env lue à l'appel, jamais au module load.
  return envPresent("ESCROW_API_URL", "ESCROW_API_KEY", "ESCROW_WEBHOOK_SECRET");
}

function baseUrl(): string {
  // Sans slash final (les paths commencent par /).
  return (process.env.ESCROW_API_URL as string).replace(/\/+$/, "");
}

/** Appel HTTP au tiers séquestre (Bearer + Idempotency-Key) avec timeout + erreur typée. */
async function escrowFetch<T>(
  method: string,
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const apiKey = process.env.ESCROW_API_KEY as string;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
        // I8 : idempotence côté tiers (un retry ne crée pas 2 mouvements).
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: payload,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`escrow HTTP ${res.status} ${method} ${path} — ${text.slice(0, 160)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Forme (partielle) d'une réponse d'instruction / mouvement du tiers séquestre. */
interface EscrowMovementResponse {
  id?: string;
  reference?: string;
  /** Instructions de virement à présenter à l'investisseur (IBAN, réf, etc.). */
  instructions?: Record<string, string>;
}

export const emiNotaireEscrowAdapter: EscrowPort = {
  isConfigured: escrowIsConfigured,

  async createDepositInstruction(input) {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const res = await escrowFetch<EscrowMovementResponse>(
      "POST",
      "/deposits",
      {
        deal_id: input.account.dealId,
        provider: input.account.provider,
        account_ref: input.account.externalRef,
        subscription_id: input.subscriptionId,
        amount_eur: input.amountEur,
        direction: "inflow",
        movement_type: "deposit",
      },
      input.idempotencyKey,
    );
    return {
      providerRef: res.reference ?? res.id ?? "",
      instructions: res.instructions ?? {},
    };
  },

  async release(input) {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const res = await escrowFetch<EscrowMovementResponse>(
      "POST",
      "/releases",
      {
        deal_id: input.account.dealId,
        provider: input.account.provider,
        account_ref: input.account.externalRef,
        direction: "outflow",
        movement_type: "release_to_spv",
      },
      input.idempotencyKey,
    );
    return { providerRef: res.reference ?? res.id ?? "" };
  },

  async refund(input) {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const res = await escrowFetch<EscrowMovementResponse>(
      "POST",
      "/refunds",
      {
        deal_id: input.account.dealId,
        provider: input.account.provider,
        account_ref: input.account.externalRef,
        subscription_id: input.subscriptionId,
        amount_eur: input.amountEur,
        direction: "outflow",
        movement_type: "refund",
      },
      input.idempotencyKey,
    );
    return { providerRef: res.reference ?? res.id ?? "" };
  },

  verifyWebhook(req) {
    if (!escrowIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const secret = process.env.ESCROW_WEBHOOK_SECRET;
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
