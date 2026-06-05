/**
 * PROJECTION DE TRÉSORERIE MENSUELLE — profil de cashflow projet (J-curve).
 *
 * Étude P8 graph 8 : « flux mensuels (sorties travaux, entrée revente) →
 * profil de trésorerie, J-curve ».
 *
 * Modèle (vue PROJET, pas investisseur) :
 *   - Mois 0 : décaissement d'acquisition net = prix d'acquisition + frais de
 *     notaire + frais opérateur acquisition, FINANCÉ par dette + equity +
 *     obligations (entrée de cash). Le net est donc le besoin résiduel.
 *   - Travaux : étalés linéairement sur la `fenetre_travaux_mois` à partir du
 *     mois 1 (sorties).
 *   - Frais divers / portage : étalés linéairement sur toute la durée.
 *   - Mois d'exit : entrée = produit de revente (sortie de cash positive).
 *
 * Le cumul produit la J-curve : creux pendant les travaux, remontée à l'exit.
 *
 * AUCUN IO. Fonction pure.
 */

import type { DealInput, CashflowPoint } from './types';

/**
 * Construit la série mensuelle de trésorerie projet.
 *
 * @param input               Inputs du deal.
 * @param fenetreTravauxMois  Nb de mois sur lesquels les travaux sont étalés
 *                            (défaut = 70 % de la durée, borné ≥ 1).
 * @param prixReventeEur      Produit de revente injecté à l'exit (défaut =
 *                            central).
 * @param dureeMois           Durée effective (défaut = durée centrale).
 */
export function projectionTresorerie(
  input: DealInput,
  fenetreTravauxMois?: number,
  prixReventeEur?: number,
  dureeMois?: number,
): CashflowPoint[] {
  const duree = Math.max(1, Math.round(dureeMois ?? input.schedule.duree_mois));
  const fenetre = Math.max(
    1,
    Math.min(duree, Math.round(fenetreTravauxMois ?? duree * 0.7)),
  );
  const prixRevente = prixReventeEur ?? input.exit.prix_revente_central_eur;

  const c = input.costs;
  const f = input.funding;

  // Entrée de financement au closing (mois 0) : dette + equity + obligations.
  const financementEntree =
    f.dette_senior_eur + f.equity_sponsor_eur + f.obligations_cible_eur;

  // Décaissement initial (mois 0) : acquisition + notaire + frais opérateur acq.
  const fraisOperateurAcq =
    c.prix_acquisition_eur * input.fees.frais_operateur_acquisition_pct;
  const decaissementInitial =
    c.prix_acquisition_eur + c.frais_notaire_eur + fraisOperateurAcq;

  // Étalement travaux & portage.
  const travauxParMois = c.budget_travaux_eur / fenetre;
  const portageParMois = c.frais_divers_portage_eur / duree;

  const points: CashflowPoint[] = [];
  let cumul = 0;

  for (let mois = 0; mois <= duree; mois++) {
    let flux = 0;
    if (mois === 0) {
      flux += financementEntree - decaissementInitial;
    }
    if (mois >= 1 && mois <= fenetre) {
      flux -= travauxParMois;
    }
    if (mois >= 1 && mois <= duree) {
      flux -= portageParMois;
    }
    if (mois === duree) {
      flux += prixRevente;
    }
    cumul += flux;
    points.push({
      mois,
      flux_mois_eur: round2(flux),
      cumul_eur: round2(cumul),
    });
  }
  return points;
}

/** Arrondi 2 décimales (centimes) pour des séries lisibles. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
