/**
 * lib/invest/compliance/types.ts — ⑧ Compliance & Reporting : types de domaine.
 *
 * Ne bloque JAMAIS en silence (statuts explicites + escalade — cf. tableau §1).
 * Alignés sur les migrations 0019/0021/0022 :
 *   - inv_kyc_cases.status : pending|approved|rejected|expired|review
 *   - inv_travel_rule_records.screening_result : clean|sanctions|mixer
 *   - inv_approvals.action : deal_publish|deal_close|transfer_over_threshold|
 *                            kiis_publish|refund_override|operator_activate
 *   - inv_approvals.status : pending|approved|rejected|expired
 *   - inv_regulatory_reports.report_type : psfp_annual|default_rate|tracfin|
 *                            investor_quarterly|ifu|incident
 */

import type { TenantId } from "../shared/types";

/** Résultat de screening AML (aligné inv_travel_rule_records.screening_result). */
export type ScreeningResult = "clean" | "sanctions" | "mixer";

/** Action soumise au 4-eyes (aligné inv_approvals.action). */
export type ApprovalAction =
  | "deal_publish"
  | "deal_close"
  | "transfer_over_threshold"
  | "kiis_publish"
  | "refund_override"
  | "operator_activate";

/** Statut d'une approbation 4-eyes (aligné inv_approvals.status). */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/** Type de reporting réglementaire (aligné inv_regulatory_reports.report_type). */
export type RegulatoryReportType =
  | "psfp_annual"
  | "default_rate"
  | "tracfin"
  | "investor_quarterly"
  | "ifu"
  | "incident";

/** Décision de compliance (sortie d'une revue de cas). */
export type ComplianceDecision = "approve" | "reject" | "edd";

/** Demande d'approbation 4-eyes (vue domaine, sous-ensemble inv_approvals). */
export interface Approval {
  id: string;
  tenantId: TenantId;
  action: ApprovalAction;
  subjectType: string;
  subjectId: string;
  approver1: string | null;
  approver2: string | null;
  status: ApprovalStatus;
}
