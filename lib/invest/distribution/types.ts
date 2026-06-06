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
 *   - inv_reports.report_type : quarterly_update|annual_update|ifu|milestone_update|final_report
 *
 * RAPPEL ANTI-FIA (L2/I2) : une distribution est le PAIEMENT D'UNE CRÉANCE
 * obligataire (coupon / remboursement), VARIABLE et NON garantie — jamais un
 * « rendement » servi sur un pool ni une valeur consolidée (pas de NAV).
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

/** Type de rapport (aligné inv_reports.report_type). */
export type ReportType = "quarterly_update" | "annual_update" | "ifu" | "milestone_update" | "final_report";

/**
 * Genre de distribution exposé en API/route. `coupon` = intérêt périodique
 * (locatif) ; `exit` = versement final à la sortie (MdB/promotion : principal +
 * éventuel coupon). On mappe `exit → distribution_type='final'` côté DB.
 */
export type DistributionKind = "coupon" | "exit";

/** Distribution au niveau tranche (vue domaine, sous-ensemble inv_distributions). */
export interface Distribution {
  id: string;
  tenantId: TenantId;
  dealId: string;
  bondTrancheId: string;
  distributionType: DistributionType;
  grossAmountEur: Eur;
  currency: string;
  status: DistributionStatus;
  waterfallRank: number | null;
  createdAt?: string;
}

/** Payout d'un porteur (vue domaine, sous-ensemble inv_distribution_payouts). */
export interface Payout {
  id: string;
  distributionId: string;
  dealId: string;
  bondTrancheId: string;
  holderUserId: string;
  holderProfileId: string;
  unitsHeld: number;
  grossAmountEur: Eur;
  withholdingEur: Eur;
  netAmountEur: Eur;
  currency: string;
  status: PayoutStatus;
  paidAt: string | null;
  /** Renseigné par jointure deal (présentation portefeuille). */
  dealName?: string | null;
  distributionType?: DistributionType;
  createdAt?: string;
}

/**
 * Résultat d'une exécution `runDistribution`. JAMAIS de valeur consolidée :
 * `totalGrossEur` est la somme des créances payées sur CE deal, pas une NAV.
 */
export interface RunDistributionResult {
  /** true si la distribution avait déjà été calculée (idempotence). */
  replayed: boolean;
  distributionId: string;
  dealId: string;
  bondTrancheId: string;
  kind: DistributionKind;
  /** Round séquentiel utilisé pour la clé d'idempotence. */
  round: number;
  /** Type DB effectif (`coupon` ou `final`). */
  distributionType: DistributionType;
  /** Montant total dû au niveau tranche (depuis le waterfall / le coupon). */
  totalGrossEur: Eur;
  /** Nombre de porteurs servis (un payout par porteur). */
  holders: number;
  /** Statut effectif des payouts (`paid` si escrow exécuté, sinon `pending`). */
  payoutStatus: PayoutStatus;
  /** true si l'escrow n'était pas configuré → payouts `pending` (fail-soft). */
  escrowFailSoft: boolean;
  /** Détail par porteur (prorata des units). */
  payouts: PayoutShare[];
}

/** Part calculée d'un porteur dans une distribution (prorata des units). */
export interface PayoutShare {
  holderUserId: string;
  holderProfileId: string;
  bondTrancheId: string;
  unitsHeld: number;
  grossAmountEur: Eur;
  withholdingEur: Eur;
  netAmountEur: Eur;
  status: PayoutStatus;
}
