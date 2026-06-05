/**
 * lib/invest/secondary/types.ts — ⑨ Secondary Market (bulletin board) : types de domaine.
 *
 * ADR-007 : BABILLARD ECSP art. 25 — JAMAIS d'order book à matching automatique
 * (= MTF, hors périmètre). Mise en relation manuelle ; exécution = transfert P2P
 * whitelisté (canTransfer).
 * Alignés sur la migration 0019 (inv_secondary_orders) :
 *   - side : buy | sell
 *   - status : open | withdrawn | expired | settled
 */

import type { Eur, TenantId } from "../shared/types";

/** Sens d'une annonce (aligné inv_secondary_orders.side). */
export type ListingSide = "buy" | "sell";

/** Statut d'une annonce (aligné inv_secondary_orders.status). */
export type ListingStatus = "open" | "withdrawn" | "expired" | "settled";

/**
 * Annonce du babillard (vue domaine, sous-ensemble inv_secondary_orders).
 * `indicativePriceEur` est INDICATIF (pas un ordre exécutable — ADR-007).
 */
export interface Listing {
  id: string;
  tenantId: TenantId;
  dealId: string;
  userId: string;
  side: ListingSide;
  units: number;
  indicativePriceEur: Eur | null;
  status: ListingStatus;
}
