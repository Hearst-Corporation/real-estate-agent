import { describe, it, expect } from 'vitest';
import {
  parseIsoDateUtc,
  toIsoDateUtc,
  addMonthsIso,
  daysBetween,
  yearFraction,
} from './dates';

describe('parse / serialize ISO UTC', () => {
  it('round-trip parse → serialize', () => {
    expect(toIsoDateUtc(parseIsoDateUtc('2026-09-01'))).toBe('2026-09-01');
  });

  it('rejette un format invalide', () => {
    expect(() => parseIsoDateUtc('01/09/2026')).toThrow();
    expect(() => parseIsoDateUtc('2026-13-01')).not.toThrow(); // JS normalise; mais format ok
  });
});

describe('addMonthsIso', () => {
  it('ajoute 22 mois à 2026-09-01 → 2028-07-01', () => {
    expect(addMonthsIso('2026-09-01', 22)).toBe('2028-07-01');
  });

  it('gère le débordement de fin de mois (31 jan + 1 mois → 28 fév 2026)', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('année bissextile (31 jan + 1 mois → 29 fév 2028)', () => {
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('daysBetween', () => {
  it('1 an non bissextile = 365 jours', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('symétrie inverse', () => {
    expect(daysBetween('2027-01-01', '2026-01-01')).toBe(-365);
  });
});

describe('yearFraction', () => {
  it('ACT/365 sur 1 an = 1.0', () => {
    expect(yearFraction('2026-01-01', '2027-01-01', 'ACT_365')).toBeCloseTo(1.0, 9);
  });

  it('ACT/360 sur 360 jours = 1.0', () => {
    // 2026-01-01 + 360 j
    const end = toIsoDateUtc(parseIsoDateUtc('2026-01-01') + 360 * 86_400_000);
    expect(yearFraction('2026-01-01', end, 'ACT_360')).toBeCloseTo(1.0, 9);
  });

  it('30/360 : 1 mois plein = 1/12', () => {
    expect(yearFraction('2026-01-15', '2026-02-15', '30_360')).toBeCloseTo(1 / 12, 9);
  });

  it('22 mois depuis closing ≈ 1,83 an (ACT/365)', () => {
    const yf = yearFraction('2026-09-01', '2028-07-01', 'ACT_365');
    expect(yf).toBeCloseTo(22 / 12, 1); // approx, dépend des jours réels
  });
});
