/**
 * lib/post-visit/derive.ts — DÉRIVATION DÉTERMINISTE (pure, sans DB) des signaux,
 * suggestions de critères et propositions de relance à partir d'un compte-rendu
 * de visite (`visit_reports`, 0051).
 *
 * ⚠️ Aucune valeur inventée. Toute suggestion cite sa preuve (le CR). Aucun score
 * n'est produit ici : le recalcul des matchs délègue au moteur existant
 * (lib/prospection/matchAnnonce via lib/offmarket) — voir `recompute.ts`.
 *
 * Fonctions pures ⇒ testables sans réseau et sans mock DB.
 */

import type { VisitReportRow } from "@/lib/visit-report/schema";
import type { CritereAcquereur } from "@/lib/prospection/types";
import type { CriteriaSuggestion, DerivedSignals, RelanceProposal } from "./types";

/**
 * Marge de tolérance : on ne suggère un relèvement de budget que si le prix
 * évoqué dépasse le budget max du critère d'au moins ce ratio (2 %). Évite le
 * bruit sur un écart d'arrondi. Source unique — pas de magic number ailleurs.
 */
export const BUDGET_SUGGESTION_MIN_GAP_RATIO = 0.02;

/** Formatte un montant € pour un libellé de preuve lisible (pas de dépendance). */
function euros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

/** Extrait les signaux persistables du CR — reprise fidèle, zéro reformulation. */
export function deriveSignals(report: VisitReportRow): DerivedSignals {
  return {
    interest: report.interest,
    outcome: report.outcome,
    objections: report.objections ?? null,
    price_discussed: report.price_discussed ?? null,
  };
}

/**
 * Dérive les suggestions d'ajustement de critères à partir du CR et du critère
 * acquéreur courant. PROPOSITIONS uniquement — l'appelant ne les applique jamais
 * automatiquement.
 *
 * Règles (déterministes, explicables) :
 *   - price_discussed > budget_max (+ marge) → suggérer budget_max = price_discussed.
 *   - price_discussed < budget_min           → suggérer budget_min = price_discussed
 *     (l'acquéreur vise plus bas que sa borne déclarée).
 * On ne suggère RIEN sur surface/pièces depuis le CR structuré actuel (0051 ne
 * porte pas ces mesures) — pas d'invention.
 */
export function deriveCriteriaSuggestions(
  report: VisitReportRow,
  critere: Pick<CritereAcquereur, "budgetMin" | "budgetMax">,
): CriteriaSuggestion[] {
  const out: CriteriaSuggestion[] = [];
  const price = report.price_discussed;
  if (price == null || !Number.isFinite(price) || price <= 0) return out;

  const { budgetMax, budgetMin } = critere;

  if (budgetMax != null && price > budgetMax * (1 + BUDGET_SUGGESTION_MIN_GAP_RATIO)) {
    out.push({
      field: "budget_max",
      current: budgetMax,
      suggested: Math.round(price),
      reason: `Prix évoqué ${euros(price)} > budget max critère ${euros(budgetMax)}`,
    });
  }

  if (budgetMin != null && price < budgetMin) {
    out.push({
      field: "budget_min",
      current: budgetMin,
      suggested: Math.round(price),
      reason: `Prix évoqué ${euros(price)} < budget min critère ${euros(budgetMin)}`,
    });
  }

  return out;
}

/**
 * Dérive les relances à créer selon l'issue du CR. Déterministe et borné :
 *   - offre_probable → task HAUTE priorité « préparer l'offre ».
 *   - a_relancer     → task normale « relancer l'acquéreur » + brouillon message.
 *   - reflexion      → task normale « point de suivi ».
 *   - abandon        → aucune relance (on ne harcèle pas ; rien d'inventé).
 * Aucune communication n'est envoyée : task `open`, draft `draft` (HITL).
 */
export function deriveRelances(report: VisitReportRow): RelanceProposal[] {
  const out: RelanceProposal[] = [];
  const obj = report.objections?.trim();
  const objLine = obj ? ` Objections notées : ${obj}.` : "";

  switch (report.outcome) {
    case "offre_probable":
      out.push({
        kind: "task",
        entityType: "visit",
        title: "Préparer l'offre suite à la visite",
        body: `L'acquéreur est en position d'offre probable.${objLine}`,
        priority: "haute",
      });
      break;
    case "a_relancer":
      out.push({
        kind: "task",
        entityType: "lead",
        title: "Relancer l'acquéreur après visite",
        body: `Acquéreur à relancer.${objLine}`,
        priority: "normale",
      });
      out.push({
        kind: "draft",
        entityType: "lead",
        title: "Message de relance post-visite",
        body:
          "Bonjour,\n\nMerci pour votre visite. Souhaitez-vous que nous échangions " +
          "sur ce bien ou que je vous propose d'autres opportunités correspondant à " +
          "vos critères ?\n\nBien à vous,",
        priority: "normale",
      });
      break;
    case "reflexion":
      out.push({
        kind: "task",
        entityType: "lead",
        title: "Point de suivi (acquéreur en réflexion)",
        body: `Acquéreur en réflexion après visite.${objLine}`,
        priority: "normale",
      });
      break;
    case "abandon":
      // Aucune relance — décision produit : ne pas relancer un abandon déclaré.
      break;
  }

  return out;
}
