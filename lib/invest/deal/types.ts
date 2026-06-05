/**
 * lib/invest/deal/types.ts — ② Deal & Offering : types de domaine.
 *
 * Alignés sur les migrations 0016 :
 *   - inv_deals.status : draft|open|funded|closing|live|distributing|closed|cancelled|defaulted
 *   - inv_deals.deal_type : marchand_de_biens|promotion|locatif|value_add|mixte
 *   - inv_deals.offering_regime : private_placement|ecsp|dis
 *   - inv_spvs.legal_form : SAS|SA  (seules émettrices de titres financiers)
 *   - inv_spvs.status : forming|incorporated|funded|operating|liquidating|closed|defaulted
 *   - inv_bond_tranches.token_standard : ERC-3643|ERC-1400 (jamais 20/4626 — I5)
 */

import type { Eur, TenantId } from "../shared/types";

/** Statut d'un deal (aligné inv_deals.status — valeurs exactes DB). */
export type DealStatus =
  | "draft"
  | "open"
  | "funded"
  | "closing"
  | "live"
  | "distributing"
  | "closed"
  | "cancelled"
  | "defaulted";

/** Type d'opération (aligné inv_deals.deal_type). */
export type DealType = "marchand_de_biens" | "promotion" | "locatif" | "value_add" | "mixte";

/** Régime d'offre (aligné inv_deals.offering_regime). */
export type OfferingRegime = "private_placement" | "ecsp" | "dis";

/** Forme juridique du SPV (aligné inv_spvs.legal_form). */
export type SpvLegalForm = "SAS" | "SA";

/** Statut du SPV (aligné inv_spvs.status). */
export type SpvStatus =
  | "forming"
  | "incorporated"
  | "funded"
  | "operating"
  | "liquidating"
  | "closed"
  | "defaulted";

/** Standard de token de la tranche (aligné inv_bond_tranches.token_standard). I5. */
export type DealTokenStandard = "ERC-3643" | "ERC-1400";

/** Deal (vue domaine, sous-ensemble de inv_deals). 1 SPV = 1 deal. */
export interface Deal {
  id: string;
  tenantId: TenantId;
  spvId: string;
  slug: string;
  status: DealStatus;
  dealType: DealType;
  offeringRegime: OfferingRegime;
  targetRaiseEur: Eur;
  raisedEur: Eur;
  minTicketEur: Eur;
  maxTicketEur: Eur | null;
  /** Réservé aux avertis ? (gate de souscription — cf. ①). */
  restrictedToSophisticated: boolean;
}
