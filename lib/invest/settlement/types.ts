/**
 * lib/invest/settlement/types.ts — ⑤ Settlement & Funds : types de domaine.
 *
 * I2/I4 : flux de fonds en séquestre tiers PAR DEAL, jamais de solde plateforme.
 * Alignés sur la migration 0017 (inv_escrow_movements) :
 *   - direction : inflow | outflow
 *   - movement_type : deposit | release_to_spv | refund | fee
 *   - currency : EUR | EURC | EURe (exclut USDT — I6)
 *   - escrow_provider : notaire | carpa | emi | psp_segregated (TIERS par construction)
 *   - status : pending | confirmed | reconciled | reversed | failed
 */

import type { Eur, TenantId } from "../shared/types";

/** Sens du mouvement (aligné inv_escrow_movements.direction). */
export type MovementDirection = "inflow" | "outflow";

/** Nature du mouvement (aligné inv_escrow_movements.movement_type). */
export type MovementType =
  | "deposit" // investisseur → séquestre (inflow)
  | "release_to_spv" // séquestre → SPV au closing (outflow)
  | "refund" // séquestre → investisseur (outflow, deal annulé)
  | "fee"; // séquestre → plateforme/opérateur (outflow)

/** Rail / devise (aligné inv_escrow_movements.currency). I6 — pas d'USDT. */
export type SettlementRail = "EUR" | "EURC" | "EURe";

/** Fournisseur de séquestre (aligné inv_escrow_movements.escrow_provider). I4. */
export type EscrowProvider = "notaire" | "carpa" | "emi" | "psp_segregated";

/** Statut de réconciliation du mouvement (aligné inv_escrow_movements.status). */
export type SettlementStatus = "pending" | "confirmed" | "reconciled" | "reversed" | "failed";

/**
 * Mouvement de fonds (vue domaine, sous-ensemble de inv_escrow_movements).
 * I2 : toujours rattaché à un deal via la souscription — jamais un solde libre.
 */
export interface EscrowMovement {
  id: string;
  tenantId: TenantId;
  subscriptionId: string; // I2 — lien obligatoire vers une souscription/deal
  direction: MovementDirection;
  movementType: MovementType;
  amountEur: Eur;
  currency: SettlementRail;
  escrowProvider: EscrowProvider;
  status: SettlementStatus;
}
