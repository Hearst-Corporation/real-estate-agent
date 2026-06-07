/**
 * WATERFALL DE DISTRIBUTION — cascade de paiement à l'exit.
 *
 * Implémente STRICTEMENT l'ordre de paiement de l'étude P7 ("Waterfall — ordre
 * de paiement à l'exit") :
 *
 *   1. Remboursement dette bancaire SENIOR + intérêts
 *   2. Remboursement PRINCIPAL obligataire (token holders)
 *   3. Coupon / intérêt obligataire (taux cible)
 *   4. Frais plateforme + frais opérateur
 *   5. Prime de performance (carried) opérateur AU-DELÀ d'un hurdle
 *   6. Solde → equity sponsor
 *
 * Principe : on part du PRODUIT DE REVENTE en haut de cascade et on sert chaque
 * étage dans l'ordre. Chaque étage est servi au PRORATA du solde disponible —
 * si le solde manque, l'étage subit un `shortfall` et les étages suivants
 * reçoivent 0. C'est la traduction de la SUBORDINATION : le senior est servi
 * avant l'obligataire, l'obligataire avant l'equity (intercreditor, P11).
 *
 * Justification anti-FIA (rappel) : l'investisseur est un CRÉANCIER obligataire.
 * Son "rendement" est le coupon + le remboursement du principal, pas une part
 * d'un résultat collectif. L'upside illimité va à l'equity sponsor (dernier
 * servi), pas mutualisé entre investisseurs (étude P3, P15).
 *
 * Détail important sur le CARRIED (étage 5) : le carried n'est PAS calculé sur
 * la totalité du solde résiduel, mais sur la SUR-PERFORMANCE au-delà du hurdle.
 * On calcule le montant d'equity qui correspond exactement au hurdle (return
 * préférentiel du sponsor), puis le carried = `carried_pct` × (résidu au-dessus
 * de ce seuil). Le reste va à l'equity. C'est le modèle standard "carried over
 * a preferred return / hurdle".
 *
 * AUCUN IO. Fonction pure.
 */

import type {
  DealInput,
  WaterfallResult,
  WaterfallTier,
  WaterfallTierKey,
} from './types';

/** Garde-fou : un montant ne peut être négatif après rationnement. */
function clampPos(x: number): number {
  return x > 0 ? x : 0;
}

/**
 * Sert un étage : prélève min(dû, solde) sur le solde courant.
 * Retourne l'étage renseigné + le nouveau solde.
 */
function serveTier(
  key: WaterfallTierKey,
  label: string,
  du: number,
  solde: number,
): { tier: WaterfallTier; solde: number } {
  const duPos = clampPos(du);
  const paye = Math.min(duPos, clampPos(solde));
  const soldeApres = clampPos(solde - paye);
  return {
    tier: {
      key,
      label,
      du_eur: duPos,
      paye_eur: paye,
      solde_apres_eur: soldeApres,
      shortfall_eur: clampPos(duPos - paye),
    },
    solde: soldeApres,
  };
}

/**
 * Calcule le coupon obligataire CIBLE dû sur la durée effective.
 * Coupon = principal × taux annuel × (durée_mois / 12). Intérêt simple
 * (cohérent avec une obligation in fine remboursée à l'exit, P7).
 *
 * NON GARANTI : ce montant est seulement le coupon contractuel cible ; le
 * versement reste plafonné par le solde disponible (distribution variable).
 */
export function couponObligataireDu(
  principal: number,
  tauxAnnuel: number,
  dureeMois: number,
): number {
  return clampPos(principal) * tauxAnnuel * (dureeMois / 12);
}

/**
 * Intérêts senior dus sur la durée effective (intérêt simple, in fine).
 */
export function interetsSeniorDus(
  principal: number,
  tauxAnnuel: number,
  dureeMois: number,
): number {
  return clampPos(principal) * tauxAnnuel * (dureeMois / 12);
}

/**
 * Calcule le waterfall complet pour un produit de revente et une durée donnés.
 *
 * @param input             Inputs du deal (financement, frais).
 * @param produitReventeEur Produit de revente NET injecté en haut de cascade.
 * @param dureeMois         Durée effective (impacte intérêts senior + coupon).
 */
export function computeWaterfall(
  input: DealInput,
  produitReventeEur: number,
  dureeMois: number,
): WaterfallResult {
  const { funding, fees } = input;

  // ── Montants DUS par étage ────────────────────────────────────────────────
  const seniorPrincipal = clampPos(funding.dette_senior_eur);
  const seniorInterets = interetsSeniorDus(
    seniorPrincipal,
    funding.taux_dette_senior_annuel,
    dureeMois,
  );
  const obligPrincipal = clampPos(funding.obligations_cible_eur);
  const obligCoupon = couponObligataireDu(
    obligPrincipal,
    funding.taux_coupon_obligataire_annuel,
    dureeMois,
  );
  // Frais plateforme = entrée (sur la collecte) + admin annualisé (sur durée).
  const fraisPlateforme =
    obligPrincipal * fees.frais_plateforme_entree_pct +
    obligPrincipal * fees.frais_plateforme_admin_annuel_pct * (dureeMois / 12);
  const fraisOperateur =
    input.costs.prix_acquisition_eur * fees.frais_operateur_acquisition_pct;
  const equityApporte = clampPos(funding.equity_sponsor_eur);

  // ── Cascade : on sert dans l'ordre de priorité ─────────────────────────────
  const tiers: WaterfallTier[] = [];
  let solde = clampPos(produitReventeEur);

  const t1 = serveTier(
    'dette_senior_principal',
    '1. Remboursement principal dette senior',
    seniorPrincipal,
    solde,
  );
  tiers.push(t1.tier);
  solde = t1.solde;

  const t1b = serveTier(
    'dette_senior_interets',
    '1bis. Intérêts dette senior',
    seniorInterets,
    solde,
  );
  tiers.push(t1b.tier);
  solde = t1b.solde;

  const t2 = serveTier(
    'obligations_principal',
    '2. Remboursement principal obligataire',
    obligPrincipal,
    solde,
  );
  tiers.push(t2.tier);
  solde = t2.solde;

  const t3 = serveTier(
    'obligations_coupon',
    '3. Coupon obligataire (cible)',
    obligCoupon,
    solde,
  );
  tiers.push(t3.tier);
  solde = t3.solde;

  const t4a = serveTier(
    'frais_plateforme',
    '4a. Frais plateforme',
    fraisPlateforme,
    solde,
  );
  tiers.push(t4a.tier);
  solde = t4a.solde;

  const t4b = serveTier(
    'frais_operateur',
    '4b. Frais opérateur',
    fraisOperateur,
    solde,
  );
  tiers.push(t4b.tier);
  solde = t4b.solde;

  // ── Étage 5 : CARRIED au-delà du hurdle ────────────────────────────────────
  // À ce stade, `solde` revient économiquement à l'equity sponsor. Le carried
  // ne s'applique qu'à la SUR-PERFORMANCE au-delà du return préférentiel
  // (hurdle) calculé sur l'equity apporté pour la durée de l'opération.
  //
  //   seuil_hurdle = equity × (1 + hurdle_annuel × durée/12)
  //   surplus      = max(0, equity_value_avant_carried - seuil_hurdle)
  //   carried      = carried_pct × surplus
  //
  // equity_value_avant_carried = solde (tout le résiduel reviendrait à l'equity
  // en l'absence de carried).
  const equityValueAvantCarried = solde;
  const seuilHurdle =
    equityApporte * (1 + clampPos(fees.hurdle_annuel) * (dureeMois / 12));
  const surplus = clampPos(equityValueAvantCarried - seuilHurdle);
  const carriedDu = surplus * clampPos(fees.carried_operateur_pct);

  const t5 = serveTier(
    'carried_operateur',
    '5. Carried opérateur (> hurdle)',
    carriedDu,
    solde,
  );
  tiers.push(t5.tier);
  solde = t5.solde;

  // ── Étage 6 : solde → equity sponsor (dernier servi) ───────────────────────
  // Tout le reste revient à l'equity. "Dû" = ce qui reste (par construction).
  const t6 = serveTier('equity_sponsor', '6. Solde → equity sponsor', solde, solde);
  tiers.push(t6.tier);
  solde = t6.solde;

  // ── Synthèse côté obligataire ──────────────────────────────────────────────
  const principalRembourse = t2.tier.paye_eur;
  const couponPercu = t3.tier.paye_eur;
  const totalPercu = principalRembourse + couponPercu;
  const multiple = obligPrincipal > 0 ? totalPercu / obligPrincipal : 0;
  const perteCapital = clampPos(obligPrincipal - principalRembourse);

  return {
    produit_revente_eur: clampPos(produitReventeEur),
    tiers,
    obligataire: {
      principal_rembourse_eur: principalRembourse,
      coupon_percu_eur: couponPercu,
      total_percu_eur: totalPercu,
      multiple_sur_capital: multiple,
      perte_capital_eur: perteCapital,
    },
    equity_residuel_eur: t6.tier.paye_eur,
  };
}
