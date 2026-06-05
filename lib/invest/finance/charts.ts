/**
 * GÉNÉRATEURS DES 11 GRAPHIQUES (étude P8).
 *
 * Chaque fonction transforme les inputs/résultats du moteur en un DATA CONTRACT
 * self-contained (cf. types.ts §7) que la couche UI consomme directement — sans
 * aucune logique financière. Les libellés et interprétations sont en français
 * et reprennent l'esprit de l'étude P8.
 *
 * AUCUN IO. Fonctions pures.
 */

import type {
  DealInput,
  ScenarioKey,
  ScenarioResult,
  DealMetrics,
  ChartDetteEquity,
  ChartUseOfFunds,
  ChartWaterfall,
  ChartGantt,
  ChartScenarios,
  ChartSensibilitePrix,
  ChartSensibiliteRetard,
  ChartCashflow,
  ChartRisque,
  ChartLtvGauge,
  ChartMargeMarchand,
  ChartSegment,
  WaterfallStep,
  GanttMilestone,
  SensitivityPoint,
  RiskAxis,
} from './types';
import { coutTotal } from './metrics';
import {
  sensibilitePrix,
  sensibiliteRetard,
  pointMortPrix,
} from './scenarios';
import { projectionTresorerie } from './cashflow-projection';

/** Construit des segments avec part = valeur / total (sécurisé). */
function segments(
  entries: Array<{ key: string; label: string; valeur: number }>,
): { segments: ChartSegment[]; total: number } {
  const total = entries.reduce((s, e) => s + e.valeur, 0);
  return {
    total,
    segments: entries.map((e) => ({
      key: e.key,
      label: e.label,
      valeur_eur: e.valeur,
      part: total > 0 ? e.valeur / total : 0,
    })),
  };
}

// ── Graph 1 — Répartition dette/equity (donut) ──────────────────────────────
export function buildDetteEquity(input: DealInput): ChartDetteEquity {
  const f = input.funding;
  const { segments: segs, total } = segments([
    { key: 'dette_senior', label: 'Dette senior bancaire', valeur: f.dette_senior_eur },
    { key: 'obligations', label: 'Obligations (investisseurs)', valeur: f.obligations_cible_eur },
    { key: 'equity_sponsor', label: 'Equity sponsor', valeur: f.equity_sponsor_eur },
  ]);
  return {
    type: 'donut',
    titre: 'Répartition dette / equity',
    segments: segs,
    total_eur: total,
    interpretation:
      'Niveau de levier et alignement (skin in the game). Plus la part equity sponsor est élevée, plus l’opérateur est aligné avec les investisseurs.',
  };
}

// ── Graph 2 — Use of funds (barres empilées) ────────────────────────────────
export function buildUseOfFunds(input: DealInput): ChartUseOfFunds {
  const c = input.costs;
  const { segments: segs, total } = segments([
    { key: 'acquisition', label: 'Acquisition', valeur: c.prix_acquisition_eur },
    { key: 'notaire', label: 'Frais de notaire', valeur: c.frais_notaire_eur },
    { key: 'travaux', label: 'Travaux', valeur: c.budget_travaux_eur },
    { key: 'frais_portage', label: 'Frais divers / portage', valeur: c.frais_divers_portage_eur },
  ]);
  return {
    type: 'stacked_bar',
    titre: 'Use of funds',
    segments: segs,
    total_eur: total,
    interpretation:
      'Où va l’argent. La part travaux mesure le risque d’exécution : plus elle est élevée, plus le résultat dépend de la bonne tenue du chantier.',
  };
}

// ── Graph 3 — Waterfall de distribution (cascade) ───────────────────────────
export function buildWaterfall(centralScenario: ScenarioResult): ChartWaterfall {
  const w = centralScenario.waterfall;
  const steps: WaterfallStep[] = [];

  // Barre de départ : produit de revente (total).
  steps.push({
    key: 'produit_revente',
    label: 'Produit de revente',
    delta_eur: w.produit_revente_eur,
    cumul_eur: w.produit_revente_eur,
    is_total: true,
  });

  // Chaque étage payé = marche descendante (sortie).
  let cumul = w.produit_revente_eur;
  for (const tier of w.tiers) {
    if (tier.key === 'equity_sponsor') continue; // équivaut au "reste"
    cumul -= tier.paye_eur;
    steps.push({
      key: tier.key,
      label: tier.label,
      delta_eur: -tier.paye_eur,
      cumul_eur: cumul,
      is_total: false,
    });
  }

  // Barre finale : reste pour l'equity (total).
  steps.push({
    key: 'reste',
    label: 'Reste → equity sponsor',
    delta_eur: w.equity_residuel_eur,
    cumul_eur: w.equity_residuel_eur,
    is_total: true,
  });

  return {
    type: 'waterfall',
    titre: 'Waterfall de distribution (scénario central)',
    steps,
    interpretation:
      'Ordre de paiement à l’exit : la dette senior d’abord, puis le principal et le coupon obligataires, les frais, le carried au-delà du hurdle, et enfin l’equity sponsor (dernier servi).',
  };
}

// ── Graph 4 — Calendrier opérationnel (Gantt) ───────────────────────────────
export function buildGantt(input: DealInput): ChartGantt {
  const duree = input.schedule.duree_mois;
  // Découpage générique aligné sur l'étude P7 "Calendrier".
  const fenetreTravaux = Math.max(1, Math.round(duree * 0.65));
  const debutCommercialisation = Math.max(0, Math.round(duree * 0.55));
  const dureeCommercialisation = Math.max(1, Math.round(duree * 0.35));
  const debutExit = Math.max(0, duree - Math.max(1, Math.round(duree * 0.1)));

  const jalons: GanttMilestone[] = [
    { key: 'closing', label: 'Closing / déblocage', debut_mois: 0, duree_mois: 1 },
    { key: 'travaux', label: 'Travaux', debut_mois: 1, duree_mois: fenetreTravaux },
    {
      key: 'commercialisation',
      label: 'Commercialisation',
      debut_mois: debutCommercialisation,
      duree_mois: dureeCommercialisation,
    },
    {
      key: 'exit',
      label: 'Revente / exit',
      debut_mois: debutExit,
      duree_mois: Math.max(1, duree - debutExit),
    },
  ];
  return {
    type: 'gantt',
    titre: 'Calendrier opérationnel',
    jalons,
    duree_totale_mois: duree,
    interpretation:
      'Chemin critique et exposition au temps (coût de portage). Tout retard sur les travaux décale l’exit et érode le rendement annualisé.',
  };
}

// ── Graph 5 — Scénarios de performance (barres groupées) ────────────────────
export function buildScenarios(
  scenarios: Record<ScenarioKey, ScenarioResult>,
): ChartScenarios {
  const label: Record<ScenarioKey, string> = {
    pessimiste: 'Pessimiste',
    central: 'Central',
    optimiste: 'Optimiste',
  };
  const order: ScenarioKey[] = ['pessimiste', 'central', 'optimiste'];
  return {
    type: 'grouped_bar',
    titre: 'Scénarios de performance (TRI cible, non garanti)',
    barres: order.map((k) => ({
      key: k,
      label: label[k],
      irr: scenarios[k].irr_investisseur.irr,
      rendement_total_pct: scenarios[k].rendement_total_pct,
    })),
    interpretation:
      'La dispersion entre scénarios mesure l’incertitude. Le scénario pessimiste est toujours affiché : aucun rendement n’est garanti.',
  };
}

// ── Graph 6 — Sensibilité prix de revente → rendement (courbe) ──────────────
export function buildSensibilitePrix(input: DealInput): ChartSensibilitePrix {
  const points: SensitivityPoint[] = sensibilitePrix(input);
  return {
    type: 'line',
    titre: 'Sensibilité : prix de revente → rendement',
    x_label: 'Variation du prix de revente',
    points,
    point_mort_x: pointMortPrix(input),
    interpretation:
      'Le point mort (rendement = 0) indique la marge de sécurité : de combien le prix de revente peut baisser avant que l’investisseur ne perde.',
  };
}

// ── Graph 7 — Sensibilité retard travaux → rendement (courbe) ───────────────
export function buildSensibiliteRetard(input: DealInput): ChartSensibiliteRetard {
  const points: SensitivityPoint[] = sensibiliteRetard(input);
  return {
    type: 'line',
    titre: 'Sensibilité : retard travaux → rendement',
    x_label: 'Retard (mois)',
    points,
    interpretation:
      'Le coût du temps : chaque mois de retard allonge le portage et dilue le rendement annualisé, même à prix de revente inchangé.',
  };
}

// ── Graph 8 — Cashflow prévisionnel (aires) ─────────────────────────────────
export function buildCashflow(input: DealInput): ChartCashflow {
  return {
    type: 'area',
    titre: 'Cashflow prévisionnel (projet)',
    points: projectionTresorerie(input),
    interpretation:
      'Profil de trésorerie en J-curve : creux pendant la phase travaux (décaissements), remontée à l’exit (encaissement de la revente).',
  };
}

// ── Graph 9 — Exposition au risque (radar) ──────────────────────────────────
/**
 * Notes de risque /5 dérivées des métriques (5 = risque max). Ces notes sont
 * une SYNTHÈSE quantitative reproductible, pas un avis discrétionnaire :
 *  - marché     : risque de revente — fonction inverse de la marge marchand.
 *  - exécution  : part travaux dans le coût total.
 *  - levier     : LTV (dette/valeur).
 *  - liquidité  : durée de lock-up (plus long = moins liquide).
 *  - opérateur  : inverse du skin in the game (moins d'equity = plus de risque).
 *  - réglement. : note fixe modérée (cadre PSFP/obligataire maîtrisé, étude P15).
 */
export function buildRisque(
  input: DealInput,
  metrics: DealMetrics,
): ChartRisque {
  const clamp5 = (x: number): number => Math.max(0, Math.min(5, x));
  const round1 = (x: number): number => Math.round(x * 10) / 10;

  // Marché : marge 0 % → 5 ; marge ≥ 30 % → ~0. Linéaire décroissant.
  const noteMarche = clamp5(5 - (metrics.marge_marchand_pct / 0.3) * 5);
  // Exécution : part travaux 0 → 0 ; ≥ 50 % du coût → 5.
  const partTravaux =
    metrics.cout_total_eur > 0
      ? input.costs.budget_travaux_eur / metrics.cout_total_eur
      : 0;
  const noteExecution = clamp5((partTravaux / 0.5) * 5);
  // Levier : LTV 0 → 0 ; 80 % → 5.
  const noteLevier = clamp5((metrics.ltv / 0.8) * 5);
  // Liquidité : 0 mois → 0 ; ≥ 36 mois → 5.
  const noteLiquidite = clamp5((input.schedule.duree_mois / 36) * 5);
  // Opérateur : skin 20 % → ~0 ; 0 % → 5.
  const noteOperateur = clamp5(5 - (metrics.skin_in_the_game_pct / 0.2) * 5);
  // Réglementaire : modéré et stable (modèle obligataire PSFP éprouvé).
  const noteReglementaire = 2;

  const axes: RiskAxis[] = [
    { key: 'marche', label: 'Marché', note: round1(noteMarche) },
    { key: 'execution', label: 'Exécution', note: round1(noteExecution) },
    { key: 'levier', label: 'Levier', note: round1(noteLevier) },
    { key: 'liquidite', label: 'Liquidité', note: round1(noteLiquidite) },
    { key: 'operateur', label: 'Opérateur', note: round1(noteOperateur) },
    { key: 'reglementaire', label: 'Réglementaire', note: noteReglementaire },
  ];
  return {
    type: 'radar',
    titre: 'Exposition au risque',
    axes,
    interpretation:
      'Signature de risque comparable d’un deal à l’autre. Notes /5 (5 = risque maximal) dérivées des métriques structurelles, pas d’un avis discrétionnaire.',
  };
}

// ── Graph 10 — LTV (jauge) ──────────────────────────────────────────────────
export function buildLtvGauge(metrics: DealMetrics): ChartLtvGauge {
  return {
    type: 'gauge',
    titre: 'LTV (dette / valeur)',
    valeur: metrics.ltv,
    seuils: { vert: 0.6, orange: 0.7, rouge: 0.8 },
    interpretation:
      'Coussin avant que la dette ne dépasse la valeur. Seuils d’alerte : 60 % (vert), 70 % (orange), 80 % (rouge).',
  };
}

// ── Graph 11 — Marge marchand (barre + ligne) ───────────────────────────────
export function buildMargeMarchand(
  input: DealInput,
  metrics: DealMetrics,
): ChartMargeMarchand {
  return {
    type: 'bar_line',
    titre: 'Marge marchand',
    cout_total_eur: coutTotal(input),
    prix_revente_eur: input.exit.prix_revente_central_eur,
    marge_eur: metrics.marge_marchand_eur,
    marge_pct: metrics.marge_marchand_pct,
    seuil_fragilite_pct: 0.1,
    interpretation:
      'Matelas absorbant les aléas. Une marge inférieure à 10 % est considérée comme fragile : peu de marge avant que l’opération ne devienne déficitaire.',
  };
}
