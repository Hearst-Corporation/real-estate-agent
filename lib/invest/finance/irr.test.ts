import { describe, it, expect } from 'vitest';
import { computeIrr, npvAtRate, rendementTotalSimple } from './irr';
import type { CashFlow } from './types';

/**
 * Tests du moteur TRI/IRR. Cas chiffrés VÉRIFIABLES À LA MAIN.
 */

describe('computeIrr — cas analytiques', () => {
  it('doublement du capital en exactement 1 an → TRI = 100 %', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2027-01-01', montant_eur: 2000 },
    ];
    const r = computeIrr(flows);
    expect(r.converge).toBe(true);
    // (1+r)^1 = 2000/1000 = 2 → r = 1.0
    expect(r.irr).toBeCloseTo(1.0, 6);
  });

  it('+10 % sur 1 an → TRI = 10 %', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2027-01-01', montant_eur: 1100 },
    ];
    const r = computeIrr(flows);
    expect(r.irr).toBeCloseTo(0.1, 6);
  });

  it('flux à 6 mois : 1000 → 1100 → TRI annualisé ≈ 21 %', () => {
    // (1+r)^0.5 = 1.1 → 1+r = 1.21 → r = 0.21
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2026-07-02', montant_eur: 1100 }, // ~182 j ≈ 0.4986 an
    ];
    const r = computeIrr(flows);
    expect(r.irr).not.toBeNull();
    // tolérance large car la demi-année calendaire n'est pas pile 0.5
    expect(r.irr!).toBeGreaterThan(0.19);
    expect(r.irr!).toBeLessThan(0.23);
  });

  it('VAN au TRI trouvé est ≈ 0 (qualité du zéro)', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -10000 },
      { date: '2026-06-01', montant_eur: 3000 },
      { date: '2027-01-01', montant_eur: 4000 },
      { date: '2028-01-01', montant_eur: 5000 },
    ];
    const r = computeIrr(flows);
    expect(r.converge).toBe(true);
    expect(r.irr).not.toBeNull();
    expect(Math.abs(npvAtRate(flows, r.irr!))).toBeLessThan(1e-4);
  });

  it('série multi-flux avec décaissements intermédiaires (J-curve)', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -100000 },
      { date: '2026-06-01', montant_eur: -20000 }, // appel de fonds travaux
      { date: '2027-12-01', montant_eur: 150000 }, // exit
    ];
    const r = computeIrr(flows);
    expect(r.converge).toBe(true);
    expect(r.irr).not.toBeNull();
    expect(Math.abs(npvAtRate(flows, r.irr!))).toBeLessThan(1e-4);
  });
});

describe('computeIrr — robustesse & cas limites', () => {
  it('perte totale (remboursement 0) → pas de TRI (null)', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2027-01-01', montant_eur: 0 },
    ];
    const r = computeIrr(flows);
    expect(r.irr).toBeNull();
    expect(r.methode).toBe('aucune');
  });

  it('tous flux positifs → pas de TRI (null)', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: 1000 },
      { date: '2027-01-01', montant_eur: 2000 },
    ];
    expect(computeIrr(flows).irr).toBeNull();
  });

  it('un seul flux → pas de TRI (null)', () => {
    expect(computeIrr([{ date: '2026-01-01', montant_eur: -1000 }]).irr).toBeNull();
    expect(computeIrr([]).irr).toBeNull();
  });

  it('perte partielle → TRI négatif', () => {
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2027-01-01', montant_eur: 800 }, // -20 % sur 1 an
    ];
    const r = computeIrr(flows);
    expect(r.irr).toBeCloseTo(-0.2, 6);
  });

  it('flux non triés en entrée → résultat identique (tri interne)', () => {
    const desordre: CashFlow[] = [
      { date: '2027-01-01', montant_eur: 1100 },
      { date: '2026-01-01', montant_eur: -1000 },
    ];
    expect(computeIrr(desordre).irr).toBeCloseTo(0.1, 6);
  });

  it('fallback bissection : converge même si Newton échoue (flux très convexes)', () => {
    // Série avec fort changement de courbure ; on vérifie juste la convergence.
    const flows: CashFlow[] = [
      { date: '2026-01-01', montant_eur: -1000 },
      { date: '2026-02-01', montant_eur: 5000 },
      { date: '2026-03-01', montant_eur: -4100 },
    ];
    const r = computeIrr(flows);
    // racine existe ; méthode newton OU bisection, mais doit converger.
    expect(r.irr).not.toBeNull();
    expect(Math.abs(npvAtRate(flows, r.irr!))).toBeLessThan(1e-3);
  });
});

describe('rendementTotalSimple', () => {
  it('+16,5 % : 740 000 investi, 862 100 perçu', () => {
    const flows: CashFlow[] = [
      { date: '2026-09-01', montant_eur: -740000 },
      { date: '2028-07-01', montant_eur: 862100 },
    ];
    expect(rendementTotalSimple(flows)).toBeCloseTo(862100 / 740000 - 1, 9);
  });

  it('aucun décaissement → null', () => {
    expect(rendementTotalSimple([{ date: '2026-01-01', montant_eur: 100 }])).toBeNull();
  });
});
