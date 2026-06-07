/**
 * lib/invest/settlement/index.ts — ⑤ Settlement & Funds : services.
 *
 * ANTI-FIA matérialisé :
 *  - I2 : AUCUN endpoint « deposit balance ». Tout versement (`deposit`) référence
 *         une souscription rattachée à un deal — la fonction l'exige (garde dure).
 *  - I4 : les fonds vont en séquestre tiers (EscrowPort), jamais en propre.
 *  - I6 : rail WHITELISTÉ (EUR/EURC/EURe), USDT refusé.
 * Le release n'intervient qu'au closing (saga). Opérations = stubs typés (Jalon 1).
 */

import { NotImplementedError, InvariantViolationError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { EscrowMovement, SettlementRail } from "./types";

export * from "./types";

/** Rails whitelistés (I6) — la seule porte d'entrée des fonds. */
const ALLOWED_RAILS: readonly SettlementRail[] = ["EUR", "EURC", "EURe"];

/**
 * Instruit un versement vers le SÉQUESTRE TIERS (I4) pour une souscription donnée.
 * I2 : exige un subscriptionId — il n'existe AUCUN « dépôt de solde » sans deal.
 * I6 : refuse tout rail non whitelisté.
 */
export async function instructDeposit(input: {
  subscriptionId: string; // I2 — obligatoire, jamais un solde plateforme
  rail: SettlementRail;
  amountEur: number;
}): Promise<EscrowMovement> {
  if (!input.subscriptionId) {
    throw new InvariantViolationError("I2", "versement sans souscription (dépôt de solde interdit)");
  }
  if (!ALLOWED_RAILS.includes(input.rail)) {
    throw new InvariantViolationError("I6", `rail non autorisé: ${input.rail}`);
  }
  const _db = getSupabaseAdmin(); // filtrer user_id + tenant_id (I9)
  throw new NotImplementedError("settlement.instructDeposit — Jalon 1");
}

/** Libère les fonds vers le SPV au closing (délègue EscrowPort.release). I4. */
export async function releaseToSpv(_dealId: string): Promise<void> {
  throw new NotImplementedError("settlement.releaseToSpv — Jalon 1");
}

/** Rembourse intégralement si échec/annulation (délègue EscrowPort.refund). */
export async function refund(_subscriptionId: string): Promise<void> {
  throw new NotImplementedError("settlement.refund — Jalon 1");
}
