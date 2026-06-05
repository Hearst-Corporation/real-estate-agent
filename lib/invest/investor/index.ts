/**
 * lib/invest/investor/index.ts — ① Investor & Identity : services.
 *
 * Logique PURE implémentée ici : classification + calcul de plafond (aucune I/O).
 * Les opérations DB/KYC sont des stubs typés (NotImplementedError → Jalon 1).
 *
 * Anti-FIA : ce contexte ne détient pas les fonds et ne sélectionne JAMAIS un
 * deal (I3). Il borne seulement la capacité de souscription de l'investisseur.
 */

import type { Eur } from "../shared/types";
import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type {
  InvestorClass,
  InvestorProfile,
  InvestmentCapResult,
  LossCapacityInputs,
  AssessmentClassification,
} from "./types";

export * from "./types";

/**
 * Plancher de plafond pour non-averti : 1000 € = 100 000 centimes.
 * (cf. blueprint §2.3 « cap = max(1000€, 5% patrimoine) » et instruction Epic 0.2).
 */
export const RETAIL_CAP_FLOOR_CENTS: Eur = 100_000;

/** Part du patrimoine net investissable pour un non-averti : 5 %. */
export const RETAIL_CAP_NET_WORTH_RATIO = 0.05;

/**
 * Calcul PUR du plafond d'investissement annuel (centimes).
 *
 * - averti (sophisticated/professional)  → null (pas de plafond).
 * - non-averti (non_sophisticated)       → max(100 000c, 5 % du patrimoine net).
 *
 * Patrimoine net = max(0, revenu + actifs liquides − engagements) (cf. colonne
 * générée DB). Le plancher 1000€ s'applique même si le patrimoine est nul/négatif.
 */
export function computeInvestmentCap(input: {
  investorClass: InvestorClass;
  lossCapacity?: LossCapacityInputs;
}): InvestmentCapResult {
  // Avertis : aucun plafond (I3 reste : c'est l'investisseur qui choisit le deal).
  if (input.investorClass === "sophisticated" || input.investorClass === "professional") {
    return {
      capEur: null,
      isCapped: false,
      rationale: `investisseur ${input.investorClass} : aucun plafond ECSP`,
    };
  }

  // Non-averti : plafond = max(plancher, 5% du patrimoine net).
  const lc = input.lossCapacity;
  const netWorth = lc
    ? Math.max(0, lc.annualIncomeEur + lc.liquidAssetsEur - lc.financialCommitmentsEur)
    : 0;
  const fivePercent = Math.round(netWorth * RETAIL_CAP_NET_WORTH_RATIO);
  const cap = Math.max(RETAIL_CAP_FLOOR_CENTS, fivePercent);

  return {
    capEur: cap,
    isCapped: true,
    rationale:
      fivePercent > RETAIL_CAP_FLOOR_CENTS
        ? `non_sophisticated : 5% du patrimoine net (${netWorth}c)`
        : `non_sophisticated : plancher 1000€ (patrimoine net ${netWorth}c)`,
  };
}

/**
 * Classification PURE issue de l'assessment (sortie retail | sophisticated).
 * Règle simple v1 : test de connaissance réussi ⇒ éligible sophisticated SI
 * déclaré ; sinon retail. (Le détail réglementaire art. 21/22 est affiné Jalon 1.)
 */
export function classifyFromAssessment(input: {
  knowledgePassed: boolean;
  declaresSophisticated: boolean;
}): AssessmentClassification {
  return input.knowledgePassed && input.declaresSophisticated ? "sophisticated" : "retail";
}

/** Mappe une classification d'assessment vers la classe de profil persistée. */
export function toInvestorClass(c: AssessmentClassification): InvestorClass {
  return c === "sophisticated" ? "sophisticated" : "non_sophisticated";
}

// ── Services à I/O (stubs typés — Jalon 1) ──────────────────────────────────

/** Crée/maj le profil + questionnaire suitability (DB). */
export async function upsertInvestorProfile(_input: {
  userId: string;
}): Promise<InvestorProfile> {
  const _db = getSupabaseAdmin(); // service-role : filtrer user_id + tenant_id (I9)
  throw new NotImplementedError("investor.upsertInvestorProfile — Jalon 1");
}

/** Lit le profil + plafonds calculés (DB). */
export async function getInvestorProfile(_userId: string): Promise<InvestorProfile | null> {
  throw new NotImplementedError("investor.getInvestorProfile — Jalon 1");
}
