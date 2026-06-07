/**
 * lib/invest/subscription/types.ts — ③ Subscription & Order : types de domaine.
 *
 * Statuts EXACTS de inv_subscriptions.status (migration 0017) :
 *   reserved → signed → funded → allocated → minted
 *   + refunded | cancelled | withdrawn (sorties)
 * settlement_currency EXACT : EUR | EURC | EURe (0017, exclut USDT par CHECK — I6).
 */

import type { Eur, TenantId } from "../shared/types";

/** Statut de souscription (aligné inv_subscriptions.status — valeurs exactes DB). */
export type SubscriptionStatus =
  | "reserved" // soft-commit, AUCUN versement (clé anti-collecte — I2)
  | "signed" // bulletin + contrat signés (eIDAS)
  | "funded" // fonds reçus en séquestre tiers (I4)
  | "allocated" // alloué au closing (déblocage + inscription DEEP — I1)
  | "minted" // token ERC-3643 minté (miroir — I5)
  | "refunded" // remboursé (deal annulé / échec levée)
  | "cancelled" // annulé avant versement
  | "withdrawn"; // retrait pendant délai de réflexion 4j (ECSP)

/** Devise de règlement (aligné inv_subscriptions.settlement_currency). I6. */
export type SettlementCurrency = "EUR" | "EURC" | "EURe";

/**
 * Événements pilotant la machine à états de la souscription.
 * NB anti-FIA : `fund` n'est JAMAIS un « dépôt de solde » — il suppose une
 * souscription `signed` rattachée à un deal précis (I2/I3).
 */
export type SubscriptionEvent =
  | { type: "sign"; envelopeId: string } // acte explicite eIDAS (I3)
  | { type: "fund"; rail: SettlementCurrency; amountEur: Eur } // versement → séquestre (I2/I4)
  | { type: "allocate" } // closing : conditions suspensives remplies
  | { type: "mint" } // miroir on-chain après DEEP (I1)
  | { type: "withdraw" } // rétractation 4j ECSP (depuis signed)
  | { type: "cancel" } // annulation avant versement
  | { type: "refund" }; // remboursement (échec levée / annulation deal)

/** Souscription (vue domaine, sous-ensemble de inv_subscriptions). */
export interface Subscription {
  id: string;
  tenantId: TenantId;
  dealId: string; // I2/I3 — JAMAIS null : pas de souscription « hors deal »
  userId: string;
  status: SubscriptionStatus;
  amountEur: Eur;
  units: number;
  unitPriceEur: Eur;
  settlementCurrency: SettlementCurrency;
}
