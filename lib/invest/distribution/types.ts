/**
 * lib/invest/distribution/types.ts — ⑦ Distribution & Lifecycle : types de domaine.
 *
 * Alignés sur la migration 0019 :
 *   - inv_distributions.distribution_type : coupon|principal|principal_partial|performance|final
 *   - inv_distributions.status : planned|approved|paid|partial|cancelled
 *   - inv_distribution_payouts.status : pending|paid|failed|reversed
 * et la migration 0021 :
 *   - inv_deal_milestones.milestone_type : acquisition|permit|works|marketing|sale|exit|other
 *   - inv_deal_milestones.status : planned|in_progress|done|delayed|cancelled
 */

import type { Eur, TenantId } from "../shared/types";

/** Nature du flux (aligné inv_distributions.distribution_type). */
export type DistributionType = "coupon" | "principal" | "principal_partial" | "performance" | "final";

/** Statut de distribution (aligné inv_distributions.status). */
export type DistributionStatus = "planned" | "approved" | "paid" | "partial" | "cancelled";

/** Statut d'un payout porteur (aligné inv_distribution_payouts.status). */
export type PayoutStatus = "pending" | "paid" | "failed" | "reversed";

/** Type de jalon (aligné inv_deal_milestones.milestone_type). */
export type MilestoneType = "acquisition" | "permit" | "works" | "marketing" | "sale" | "exit" | "other";

/** Statut de jalon (aligné inv_deal_milestones.status). */
export type MilestoneStatus = "planned" | "in_progress" | "done" | "delayed" | "cancelled";

/** Distribution au niveau tranche (vue domaine, sous-ensemble inv_distributions). */
export interface Distribution {
  id: string;
  tenantId: TenantId;
  dealId: string;
  distributionType: DistributionType;
  grossAmountEur: Eur;
  status: DistributionStatus;
}

/** Payout d'un porteur (vue domaine, sous-ensemble inv_distribution_payouts). */
export interface Payout {
  id: string;
  holdingUnits: number;
  grossAmountEur: Eur;
  withholdingEur: Eur;
  netAmountEur: Eur;
  status: PayoutStatus;
}
