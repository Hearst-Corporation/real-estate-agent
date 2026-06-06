import { describe, it, expect } from 'vitest';
import { buildDealSheet } from './deal-engine';
import {
  RESIDENCE_HAUSSMANN,
  IMMEUBLE_LOCATIF,
  DEAL_DEGRADE,
} from './fixtures';

/**
 * Tests d'INTÉGRATION du moteur complet : `buildDealSheet` produit la fiche +
 * les 11 graphiques (étude P8). On vérifie la présence, le typage et la
 * cohérence interne de chaque contrat de données.
 */

describe('buildDealSheet — Résidence Haussmann (fiche complète)', () => {
  const sheet = buildDealSheet(RESIDENCE_HAUSSMANN);

  it('expose les métriques structurelles', () => {
    expect(sheet.metrics.cout_total_eur).toBe(2_440_000);
    expect(sheet.metrics.ltv).toBeCloseTo(0.5794, 3);
    expect(sheet.metrics.marge_marchand_eur).toBe(460_000);
  });

  it('rendement cible = TRI du scénario central (non garanti)', () => {
    expect(sheet.rendement_cible_irr).toBe(
      sheet.scenarios.central.irr_investisseur.irr,
    );
    expect(sheet.rendement_cible_irr).not.toBeNull();
  });

  it('aucun warning sur un deal équilibré et sain', () => {
    expect(sheet.warnings).toEqual([]);
  });

  it('les 3 scénarios sont présents', () => {
    expect(Object.keys(sheet.scenarios).sort()).toEqual([
      'central',
      'optimiste',
      'pessimiste',
    ]);
  });
});

describe('buildDealSheet — les 11 graphiques (étude P8)', () => {
  const { charts } = buildDealSheet(RESIDENCE_HAUSSMANN);

  it('g1 donut dette/equity : 3 segments, parts sommant à 1', () => {
    expect(charts.g1_dette_equity.type).toBe('donut');
    expect(charts.g1_dette_equity.segments).toHaveLength(3);
    const sommeParts = charts.g1_dette_equity.segments.reduce((s, x) => s + x.part, 0);
    expect(sommeParts).toBeCloseTo(1, 9);
    expect(charts.g1_dette_equity.total_eur).toBe(2_440_000);
  });

  it('g2 use of funds : 4 postes, total = coût total', () => {
    expect(charts.g2_use_of_funds.type).toBe('stacked_bar');
    expect(charts.g2_use_of_funds.segments).toHaveLength(4);
    expect(charts.g2_use_of_funds.total_eur).toBe(2_440_000);
    const parts = charts.g2_use_of_funds.segments.reduce((s, x) => s + x.part, 0);
    expect(parts).toBeCloseTo(1, 9);
  });

  it('g3 waterfall : démarre au produit de revente, finit au reste equity', () => {
    expect(charts.g3_waterfall.type).toBe('waterfall');
    const steps = charts.g3_waterfall.steps;
    expect(steps[0].key).toBe('produit_revente');
    expect(steps[0].cumul_eur).toBeCloseTo(2_900_000, 4);
    expect(steps[steps.length - 1].key).toBe('reste');
    // le reste = equity résiduel central
    expect(steps[steps.length - 1].cumul_eur).toBeCloseTo(380_853.333_33, 3);
  });

  it('g4 gantt : jalons dans la durée totale', () => {
    expect(charts.g4_gantt.type).toBe('gantt');
    expect(charts.g4_gantt.duree_totale_mois).toBe(22);
    for (const j of charts.g4_gantt.jalons) {
      expect(j.debut_mois).toBeGreaterThanOrEqual(0);
      expect(j.debut_mois + j.duree_mois).toBeLessThanOrEqual(22 + 1);
    }
  });

  it('g5 scenarios : 3 barres ordonnées pess/central/opt', () => {
    expect(charts.g5_scenarios.type).toBe('grouped_bar');
    expect(charts.g5_scenarios.barres.map((b) => b.key)).toEqual([
      'pessimiste',
      'central',
      'optimiste',
    ]);
  });

  it('g6 sensibilité prix : courbe + point mort', () => {
    expect(charts.g6_sensibilite_prix.type).toBe('line');
    expect(charts.g6_sensibilite_prix.points.length).toBeGreaterThan(0);
    expect(charts.g6_sensibilite_prix.point_mort_x).not.toBeNull();
  });

  it('g7 sensibilité retard : courbe décroissante', () => {
    expect(charts.g7_sensibilite_retard.type).toBe('line');
    const irrs = charts.g7_sensibilite_retard.points.map((p) => p.irr!);
    expect(irrs[0]).toBeGreaterThan(irrs[irrs.length - 1]);
  });

  it('g8 cashflow : J-curve, dernier cumul positif (exit encaissée)', () => {
    expect(charts.g8_cashflow.type).toBe('area');
    const pts = charts.g8_cashflow.points;
    expect(pts[0].mois).toBe(0);
    expect(pts[pts.length - 1].mois).toBe(22);
    // creux pendant les travaux puis remontée à l'exit
    const cumulFinal = pts[pts.length - 1].cumul_eur;
    const cumulMin = Math.min(...pts.map((p) => p.cumul_eur));
    expect(cumulFinal).toBeGreaterThan(cumulMin);
  });

  it('g9 radar risque : 6 axes notés 0..5', () => {
    expect(charts.g9_risque.type).toBe('radar');
    expect(charts.g9_risque.axes).toHaveLength(6);
    for (const a of charts.g9_risque.axes) {
      expect(a.note).toBeGreaterThanOrEqual(0);
      expect(a.note).toBeLessThanOrEqual(5);
    }
  });

  it('g10 jauge LTV : valeur + seuils 60/70/80 %', () => {
    expect(charts.g10_ltv.type).toBe('gauge');
    expect(charts.g10_ltv.valeur).toBeCloseTo(0.5794, 3);
    expect(charts.g10_ltv.seuils).toEqual({ vert: 0.6, orange: 0.7, rouge: 0.8 });
  });

  it('g11 marge marchand : 460 000 €, ≈ 18,85 %, seuil 10 %', () => {
    expect(charts.g11_marge_marchand.type).toBe('bar_line');
    expect(charts.g11_marge_marchand.marge_eur).toBe(460_000);
    expect(charts.g11_marge_marchand.marge_pct).toBeCloseTo(0.1885, 4);
    expect(charts.g11_marge_marchand.seuil_fragilite_pct).toBe(0.1);
  });
});

describe('buildDealSheet — déterminisme (fonction pure)', () => {
  it('deux appels identiques → résultats strictement égaux', () => {
    const a = buildDealSheet(RESIDENCE_HAUSSMANN);
    const b = buildDealSheet(RESIDENCE_HAUSSMANN);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('buildDealSheet — locatif (DSCR dans les métriques)', () => {
  const sheet = buildDealSheet(IMMEUBLE_LOCATIF);
  it('DSCR renseigné et au-dessus de la cible', () => {
    expect(sheet.metrics.dscr).not.toBeNull();
    expect(sheet.metrics.dscr!).toBeGreaterThan(1.2);
  });
});

describe('buildDealSheet — deal dégradé (warnings)', () => {
  const sheet = buildDealSheet(DEAL_DEGRADE);

  it('lève des warnings (LTV élevée, perte pessimiste, financement)', () => {
    expect(sheet.warnings.length).toBeGreaterThan(0);
  });

  it('détecte la LTV > 80 %', () => {
    expect(sheet.warnings.some((w) => w.includes('LTV'))).toBe(true);
  });

  it('détecte la perte en capital obligataire au scénario pessimiste', () => {
    expect(
      sheet.warnings.some((w) => w.toLowerCase().includes('perte en capital')),
    ).toBe(true);
  });
});
