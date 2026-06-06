/**
 * SCÉNARIOS & SENSIBILITÉS.
 *
 * - `runScenario` : applique un décalage (prix de revente, retard) → waterfall →
 *   flux investisseur obligataire → TRI (étude P7 "Rendement", P8 graph 5).
 * - `sensibilitePrix` / `sensibiliteRetard` : balaye un axe et trace la courbe
 *   de rendement (étude P8 graphs 6, 7).
 * - `pointMortPrix` : variation de prix où le TRI s'annule (marge de sécurité).
 *
 * FLUX INVESTISSEUR OBLIGATAIRE (convention de signe, cf. types.CashFlow) :
 *   t0 (closing)         : -principal investi (montant nominal des obligations)
 *   t_exit (closing+durée): +principal remboursé +coupon perçu (du waterfall)
 *
 * Modèle "in fine" : pour un marchand de biens / promotion, pas de coupon
 * intermédiaire — tout est perçu à l'exit (étude P6 badge "Sortie à revente").
 * Pour un locatif, on pourrait étaler les coupons ; on garde ici le modèle
 * in fine conservateur (le coupon total est versé à l'exit), ce qui SOUS-estime
 * légèrement le TRI locatif (prudence). Documenté, extensible.
 *
 * AUCUN IO. Fonctions pures.
 */

import type {
  DealInput,
  ScenarioKey,
  ScenarioResult,
  ScenarioShift,
  SensitivityPoint,
  CashFlow,
} from './types';
import { computeWaterfall } from './waterfall';
import { computeIrr, rendementTotalSimple } from './irr';
import { addMonthsIso } from './dates';

/** Prix de revente effectif d'un scénario. */
export function prixReventeScenario(input: DealInput, shift: ScenarioShift): number {
  const base = input.exit.prix_revente_central_eur;
  return base * (1 + shift.delta_prix_revente_pct);
}

/** Durée effective d'un scénario (base + retard). */
export function dureeScenario(input: DealInput, shift: ScenarioShift): number {
  return input.schedule.duree_mois + shift.retard_mois;
}

/**
 * Construit les flux investisseur obligataire pour un scénario.
 * In fine : décaissement au closing, encaissement total à l'exit.
 */
export function cashflowsInvestisseur(
  input: DealInput,
  principalRembourse: number,
  couponPercu: number,
  dureeMois: number,
): CashFlow[] {
  const t0 = input.schedule.date_closing;
  const exit = addMonthsIso(t0, Math.round(dureeMois));
  return [
    {
      date: t0,
      montant_eur: -input.funding.obligations_cible_eur,
      label: 'Souscription obligataire',
    },
    {
      date: exit,
      montant_eur: principalRembourse + couponPercu,
      label: 'Remboursement principal + coupon',
    },
  ];
}

/**
 * Exécute UN scénario complet : waterfall → flux → TRI → rendement total.
 */
export function runScenario(
  input: DealInput,
  key: ScenarioKey,
  shift: ScenarioShift,
): ScenarioResult {
  const prixRevente = prixReventeScenario(input, shift);
  const duree = dureeScenario(input, shift);
  const waterfall = computeWaterfall(input, prixRevente, duree);

  const cashflows = cashflowsInvestisseur(
    input,
    waterfall.obligataire.principal_rembourse_eur,
    waterfall.obligataire.coupon_percu_eur,
    duree,
  );
  const irr = computeIrr(cashflows, input.day_count ?? 'ACT_365');
  const rendementTotal = rendementTotalSimple(cashflows) ?? 0;

  return {
    key,
    shift,
    prix_revente_eur: prixRevente,
    duree_mois: duree,
    waterfall,
    cashflows_investisseur: cashflows,
    irr_investisseur: irr,
    rendement_total_pct: rendementTotal,
  };
}

/** Exécute les 3 scénarios standard de l'input. */
export function runAllScenarios(
  input: DealInput,
): Record<ScenarioKey, ScenarioResult> {
  return {
    pessimiste: runScenario(input, 'pessimiste', input.scenarios.pessimiste),
    central: runScenario(input, 'central', input.scenarios.central),
    optimiste: runScenario(input, 'optimiste', input.scenarios.optimiste),
  };
}

/**
 * Sensibilité du rendement au PRIX DE REVENTE (étude P8 graph 6).
 * Balaye `delta_prix_revente_pct` de `from` à `to` par pas `step`, durée centrale.
 *
 * @param from  Variation min (ex. -0.15).
 * @param to    Variation max (ex. 0.15).
 * @param step  Pas (ex. 0.05).
 */
export function sensibilitePrix(
  input: DealInput,
  from = -0.15,
  to = 0.15,
  step = 0.05,
): SensitivityPoint[] {
  const points: SensitivityPoint[] = [];
  // Itère en entiers pour éviter les dérives flottantes du pas.
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) {
    const x = round6(from + i * step);
    const res = runScenario(input, 'central', {
      delta_prix_revente_pct: x,
      retard_mois: 0,
    });
    points.push({
      x,
      irr: res.irr_investisseur.irr,
      rendement_total_pct: res.rendement_total_pct,
    });
  }
  return points;
}

/**
 * Sensibilité du rendement au RETARD DE TRAVAUX (étude P8 graph 7).
 * Balaye le retard de `from` à `to` mois par pas `step`, prix central.
 * Le retard allonge la durée → érode le TRI annualisé (coût du temps, P8).
 */
export function sensibiliteRetard(
  input: DealInput,
  from = 0,
  to = 12,
  step = 3,
): SensitivityPoint[] {
  const points: SensitivityPoint[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) {
    const x = from + i * step;
    const res = runScenario(input, 'central', {
      delta_prix_revente_pct: 0,
      retard_mois: x,
    });
    points.push({
      x,
      irr: res.irr_investisseur.irr,
      rendement_total_pct: res.rendement_total_pct,
    });
  }
  return points;
}

/**
 * POINT MORT du prix de revente : variation de prix (delta) telle que le TRI
 * investisseur = 0 (étude P8 graph 6 : « point mort = marge de sécurité »).
 *
 * Recherche par bissection sur le delta de prix dans [lo, hi]. Le TRI est
 * monotone croissant en prix de revente (plus on revend cher, plus le solde
 * obligataire est servi). Retourne null si pas de changement de signe dans la
 * plage (le deal est rentable même au plancher, ou jamais rentable).
 */
export function pointMortPrix(
  input: DealInput,
  lo = -0.6,
  hi = 0.6,
  iterations = 60,
): number | null {
  const irrAt = (delta: number): number | null =>
    runScenario(input, 'central', { delta_prix_revente_pct: delta, retard_mois: 0 })
      .irr_investisseur.irr;

  const irrLo = irrAt(lo);
  const irrHi = irrAt(hi);
  // Si le TRI au plancher est null (perte totale, pas de TRI), on traite comme
  // négatif (< 0) car l'investisseur ne récupère pas sa mise.
  const sLo = irrLo == null ? -1 : irrLo;
  const sHi = irrHi == null ? -1 : irrHi;
  if (sLo === sHi) return null; // pas d'encadrement de 0
  if (sLo > 0) return lo; // déjà rentable au plancher
  if (sHi < 0) return null; // jamais rentable dans la plage

  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    const irrMid = irrAt(mid);
    const sMid = irrMid == null ? -1 : irrMid;
    if (Math.abs(sMid) < 1e-6) return round6(mid);
    if (sMid < 0) a = mid;
    else b = mid;
  }
  return round6((a + b) / 2);
}

/** Arrondi à 6 décimales pour stabiliser les axes (anti-bruit flottant). */
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
