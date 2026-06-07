/**
 * lib/invest/investor/types.ts — ① Investor & Identity : types de domaine.
 *
 * Alignés sur les CHECK des migrations 0019/0022 :
 *   - inv_investor_profiles.investor_class : non_sophisticated | sophisticated | professional
 *   - inv_investor_profiles.investor_kind  : natural_person | legal_entity
 *   - inv_investor_profiles.kyc_status     : none | pending | approved | rejected | expired
 *   - inv_investor_assessments.classification : retail | sophisticated
 */

import type { Eur, TenantId } from "../shared/types";

/** Classification ECSP/PSFP (aligné inv_investor_profiles.investor_class). */
export type InvestorClass = "non_sophisticated" | "sophisticated" | "professional";

/** Nature de l'investisseur (aligné inv_investor_profiles.investor_kind). */
export type InvestorKind = "natural_person" | "legal_entity";

/** Statut KYC (aligné inv_investor_profiles.kyc_status). */
export type InvestorKycStatus = "none" | "pending" | "approved" | "rejected" | "expired";

/** Résultat de classification de l'assessment (aligné inv_investor_assessments.classification). */
export type AssessmentClassification = "retail" | "sophisticated";

/** Wallet (aligné inv_investor_profiles.wallet_kind). */
export type WalletKind = "none" | "self_custody" | "embedded";

/**
 * Capacité de perte (art. 21(5) ECSP), tout en CENTIMES (Eur).
 * Patrimoine net = revenu annuel + actifs liquides − engagements financiers
 * (cf. colonne générée inv_investor_assessments.net_worth_eur).
 */
export interface LossCapacityInputs {
  annualIncomeEur: Eur;
  liquidAssetsEur: Eur;
  financialCommitmentsEur: Eur;
}

/** Profil investisseur (vue domaine, sous-ensemble de inv_investor_profiles). */
export interface InvestorProfile {
  id: string;
  tenantId: TenantId;
  userId: string;
  investorKind: InvestorKind;
  investorClass: InvestorClass;
  kycStatus: InvestorKycStatus;
  declaredNetWorthEur: Eur | null;
  /** Plafond annuel d'investissement calculé (null = non plafonné, cf. avertis). */
  annualInvestmentCapEur: Eur | null;
}

/** Résultat du calcul de plafond (pur). */
export interface InvestmentCapResult {
  /** Plafond en centimes ; null = pas de plafond (averti/professionnel). */
  capEur: Eur | null;
  /** Vrai si l'investisseur est non-averti (plafond applicable). */
  isCapped: boolean;
  /** Base de calcul retenue (pour affichage / audit). */
  rationale: string;
}
