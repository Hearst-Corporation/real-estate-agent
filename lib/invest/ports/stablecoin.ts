/**
 * lib/invest/ports/stablecoin.ts — StablecoinPort (CASP : Circle EURC / Monerium EURe).
 *
 * I6/ADR-008 : règlement EUR par défaut, EURC/EURe en OPTION via CASP régulé.
 * USDT INTERDIT techniquement (whitelist d'asset). Travel Rule (TFR 2023/1113)
 * au-delà du seuil. I8 : ramp idempotent. Aucun import SDK chaîne.
 */

import type { Eur, IdempotencyKey } from "../shared/types";

/** Assets stablecoin WHITELISTÉS (I6). Toute autre valeur est refusée. */
export const ALLOWED_STABLECOIN_ASSETS = ["EURC", "EURe"] as const;
export type StablecoinAsset = (typeof ALLOWED_STABLECOIN_ASSETS)[number];

/** CASP régulé (aligné inv_travel_rule_records.casp_provider). */
export type CaspProvider = "circle" | "monerium" | "other";

/** I6 : true uniquement pour un asset whitelisté (jamais USDT). */
export function isAllowedStablecoinAsset(asset: string): asset is StablecoinAsset {
  return (ALLOWED_STABLECOIN_ASSETS as readonly string[]).includes(asset);
}

/** Informations Travel Rule (TFR 2023/1113) attachées à un transfert. */
export interface TravelRuleInfo {
  originator: Record<string, unknown>;
  beneficiary: Record<string, unknown>;
}

export interface StablecoinPort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /**
   * On-ramp / conversion vers le séquestre. REFUSE tout asset non whitelisté (I6).
   * Idempotent par `idempotencyKey` (I8, ex. ramp:{settlementId}).
   * @throws InvariantViolationError("I6") si asset non autorisé.
   */
  initiateRamp(input: {
    settlementId: string;
    asset: StablecoinAsset; // I6 — type whitelisté au compile-time
    provider: CaspProvider;
    amountEur: Eur;
    travelRule?: TravelRuleInfo;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ providerRef: string; txHash?: string }>;

  /** Vérifie la signature HMAC d'un webhook stablecoin (Pattern B). */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;
}
