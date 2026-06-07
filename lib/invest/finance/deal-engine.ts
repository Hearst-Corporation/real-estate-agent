/**
 * DEAL ENGINE — orchestrateur racine.
 *
 * `buildDealSheet(input)` transforme les INPUTS BRUTS d'un deal en une FICHE
 * DEAL complète (étude P7) + les 11 GRAPHIQUES (P8), prête à être rendue par
 * l'UI sans aucun recalcul. C'est le seul point d'entrée à connaître côté front.
 *
 * Pipeline :
 *   1. Métriques structurelles (LTV, LTC, DSCR, marge, skin).
 *   2. 3 scénarios (waterfall → flux → TRI).
 *   3. 11 graphiques.
 *   4. Warnings de cohérence (anti-erreur, pas un blocage métier).
 *
 * RAPPELS DE CADRE (étude — contraintes verrouillées) :
 *   - Le `rendement_cible_irr` est issu du scénario CENTRAL et reste un OBJECTIF
 *     NON GARANTI (badge "Distribution variable", P6 : interdit de promettre un
 *     taux).
 *   - L'investisseur est CRÉANCIER obligataire ; le moteur ne modélise jamais
 *     un pooling, une NAV globale ou un rebalancing (anti-FIA SAN-2025-08).
 *
 * AUCUN IO. Fonction pure et déterministe.
 */

import type { DealInput, DealSheet, DealMetrics, ScenarioKey, ScenarioResult } from './types';
import { computeMetrics, checkFundingBalance } from './metrics';
import { runAllScenarios } from './scenarios';
import {
  buildDetteEquity,
  buildUseOfFunds,
  buildWaterfall,
  buildGantt,
  buildScenarios,
  buildSensibilitePrix,
  buildSensibiliteRetard,
  buildCashflow,
  buildRisque,
  buildLtvGauge,
  buildMargeMarchand,
} from './charts';

/** Collecte les avertissements de cohérence du deal. */
function collectWarnings(
  input: DealInput,
  metrics: DealMetrics,
  scenarios: Record<ScenarioKey, ScenarioResult>,
): string[] {
  const w: string[] = [];

  const balance = checkFundingBalance(input);
  if (!balance.equilibre) {
    const signe = balance.ecart_eur > 0 ? 'excédentaire' : 'insuffisant';
    w.push(
      `Financement ${signe} de ${Math.abs(balance.ecart_eur).toLocaleString('fr-FR')} € ` +
        `(coût total ${metrics.cout_total_eur.toLocaleString('fr-FR')} € vs ` +
        `dette + equity + obligations).`,
    );
  }

  if (metrics.ltv > 0.8) {
    w.push(`LTV élevée (${(metrics.ltv * 100).toFixed(1)} %) — au-delà du seuil rouge de 80 %.`);
  }

  if (metrics.marge_marchand_pct < 0.1) {
    w.push(
      `Marge marchand fragile (${(metrics.marge_marchand_pct * 100).toFixed(1)} %) — ` +
        `seuil de fragilité 10 %.`,
    );
  }

  if (input.type_operation === 'locatif' && metrics.dscr != null && metrics.dscr < 1.2) {
    w.push(`DSCR sous la cible (${metrics.dscr.toFixed(2)} < 1,20).`);
  }

  // Scénario pessimiste : perte en capital obligataire ?
  const perte = scenarios.pessimiste.waterfall.obligataire.perte_capital_eur;
  if (perte > 0) {
    w.push(
      `Scénario pessimiste : perte en capital obligataire de ` +
        `${perte.toLocaleString('fr-FR')} € (principal non intégralement remboursé).`,
    );
  }

  if (metrics.skin_in_the_game_pct < 0.05) {
    w.push(
      `Skin in the game faible (${(metrics.skin_in_the_game_pct * 100).toFixed(1)} %) — ` +
        `alignement opérateur réduit.`,
    );
  }

  return w;
}

/**
 * Construit la fiche deal complète à partir des inputs bruts.
 * Point d'entrée UNIQUE du moteur financier.
 */
export function buildDealSheet(input: DealInput): DealSheet {
  const metrics = computeMetrics(input);
  const scenarios = runAllScenarios(input);

  const charts = {
    g1_dette_equity: buildDetteEquity(input),
    g2_use_of_funds: buildUseOfFunds(input),
    g3_waterfall: buildWaterfall(scenarios.central),
    g4_gantt: buildGantt(input),
    g5_scenarios: buildScenarios(scenarios),
    g6_sensibilite_prix: buildSensibilitePrix(input),
    g7_sensibilite_retard: buildSensibiliteRetard(input),
    g8_cashflow: buildCashflow(input),
    g9_risque: buildRisque(input, metrics),
    g10_ltv: buildLtvGauge(metrics),
    g11_marge_marchand: buildMargeMarchand(input, metrics),
  };

  return {
    input,
    metrics,
    scenarios,
    rendement_cible_irr: scenarios.central.irr_investisseur.irr,
    charts,
    warnings: collectWarnings(input, metrics, scenarios),
  };
}
