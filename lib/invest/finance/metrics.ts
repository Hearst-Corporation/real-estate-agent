/**
 * MÉTRIQUES STRUCTURELLES — LTV, LTC, DSCR, marge marchand, use of funds.
 *
 * Formules issues de l'étude P8 (graphs 2, 10, 11) et P11 (banque/levier).
 * AUCUN IO. Fonctions pures.
 */

import type { DealInput, DealMetrics } from './types';

/** Coût total du projet = somme des postes de coût (étude P7). */
export function coutTotal(input: DealInput): number {
  const c = input.costs;
  return (
    c.prix_acquisition_eur +
    c.frais_notaire_eur +
    c.budget_travaux_eur +
    c.frais_divers_portage_eur
  );
}

/**
 * Valeur de référence pour la LTV : valeur expertisée si fournie, sinon le
 * prix de revente central comme proxy conservateur (étude P8 graph 10).
 */
export function valeurReference(input: DealInput): number {
  return input.exit.valeur_expertise_eur ?? input.exit.prix_revente_central_eur;
}

/**
 * LTV = dette senior / valeur expertisée (étude P8 graph 10, P11 cible 55-70 %).
 * Retourne 0 si valeur nulle (évite division par zéro).
 */
export function loanToValue(input: DealInput): number {
  const v = valeurReference(input);
  return v > 0 ? input.funding.dette_senior_eur / v : 0;
}

/** LTC = dette senior / coût total (loan-to-cost, étude P7). */
export function loanToCost(input: DealInput): number {
  const total = coutTotal(input);
  return total > 0 ? input.funding.dette_senior_eur / total : 0;
}

/**
 * DSCR = revenu net / service de la dette (étude P11, cible > 1,2).
 * Pertinent UNIQUEMENT pour le locatif. Service de la dette = intérêts annuels
 * senior (in fine ; le principal est remboursé à l'exit, pas amorti).
 * Retourne null si non locatif, loyer absent ou service nul.
 */
export function debtServiceCoverageRatio(input: DealInput): number | null {
  if (input.type_operation !== 'locatif') return null;
  const loyer = input.exit.loyer_net_annuel_eur;
  if (loyer == null) return null;
  const serviceDette =
    input.funding.dette_senior_eur * input.funding.taux_dette_senior_annuel;
  if (serviceDette <= 0) return null;
  return loyer / serviceDette;
}

/**
 * Marge marchand = (prix_revente - coût_total) / coût_total (étude P8 graph 11).
 * < 0,10 = fragile. Calculée sur le scénario central.
 */
export function margeMarchand(input: DealInput): {
  pct: number;
  eur: number;
} {
  const total = coutTotal(input);
  const eur = input.exit.prix_revente_central_eur - total;
  return { pct: total > 0 ? eur / total : 0, eur };
}

/** Skin in the game = equity sponsor / total financement levé. */
export function skinInTheGame(input: DealInput): number {
  const f = input.funding;
  const totalFinancement =
    f.dette_senior_eur + f.equity_sponsor_eur + f.obligations_cible_eur;
  return totalFinancement > 0 ? f.equity_sponsor_eur / totalFinancement : 0;
}

/** Coussin de sécurité = (valeur - dette) / valeur (avant que la dette > valeur). */
export function coussinSecurite(input: DealInput): number {
  const v = valeurReference(input);
  return v > 0 ? (v - input.funding.dette_senior_eur) / v : 0;
}

/**
 * Vérifie l'équilibre du financement : COÛT TOTAL ≈ dette + equity + obligations.
 * Retourne l'écart en euros (positif = financement excédentaire, négatif =
 * trou de financement). `tolerance` en euros (défaut 1 €) absorbe les arrondis.
 */
export function checkFundingBalance(
  input: DealInput,
  tolerance = 1,
): { equilibre: boolean; ecart_eur: number } {
  const total = coutTotal(input);
  const f = input.funding;
  const apporte = f.dette_senior_eur + f.equity_sponsor_eur + f.obligations_cible_eur;
  const ecart = apporte - total;
  return { equilibre: Math.abs(ecart) <= tolerance, ecart_eur: ecart };
}

/** Agrège toutes les métriques structurelles d'un deal. */
export function computeMetrics(input: DealInput): DealMetrics {
  const marge = margeMarchand(input);
  return {
    cout_total_eur: coutTotal(input),
    ltv: loanToValue(input),
    ltc: loanToCost(input),
    dscr: debtServiceCoverageRatio(input),
    marge_marchand_pct: marge.pct,
    marge_marchand_eur: marge.eur,
    skin_in_the_game_pct: skinInTheGame(input),
    coussin_securite_pct: coussinSecurite(input),
  };
}
