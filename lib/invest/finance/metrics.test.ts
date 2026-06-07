import { describe, it, expect } from 'vitest';
import {
  coutTotal,
  loanToValue,
  loanToCost,
  debtServiceCoverageRatio,
  margeMarchand,
  skinInTheGame,
  coussinSecurite,
  checkFundingBalance,
  computeMetrics,
} from './metrics';
import { RESIDENCE_HAUSSMANN, IMMEUBLE_LOCATIF } from './fixtures';

const DEAL = RESIDENCE_HAUSSMANN;

describe('métriques — Résidence Haussmann (chiffres P7)', () => {
  it('coût total = 2 440 000 €', () => {
    // 1 800 000 + 130 000 + 420 000 + 90 000
    expect(coutTotal(DEAL)).toBe(2_440_000);
  });

  it('financement équilibré : dette + equity + obligations = coût total', () => {
    const b = checkFundingBalance(DEAL);
    expect(b.equilibre).toBe(true);
    expect(b.ecart_eur).toBe(0);
    // 1 460 000 + 240 000 + 740 000 = 2 440 000
  });

  it('LTV ≈ 58 % (1 460 000 / 2 520 000)', () => {
    expect(loanToValue(DEAL)).toBeCloseTo(1_460_000 / 2_520_000, 6);
    expect(loanToValue(DEAL)).toBeCloseTo(0.5794, 3);
  });

  it('LTC ≈ 60 % (1 460 000 / 2 440 000)', () => {
    expect(loanToCost(DEAL)).toBeCloseTo(0.5984, 3);
  });

  it('marge marchand = 460 000 € soit ≈ 18,85 %', () => {
    const m = margeMarchand(DEAL);
    expect(m.eur).toBe(460_000); // 2 900 000 - 2 440 000
    expect(m.pct).toBeCloseTo(0.1885, 4);
  });

  it('skin in the game ≈ 9,84 % (240 000 / 2 440 000)', () => {
    expect(skinInTheGame(DEAL)).toBeCloseTo(0.0984, 4);
  });

  it('coussin de sécurité = (2 520 000 - 1 460 000) / 2 520 000', () => {
    expect(coussinSecurite(DEAL)).toBeCloseTo(1_060_000 / 2_520_000, 6);
  });

  it('DSCR = null pour un marchand de biens', () => {
    expect(debtServiceCoverageRatio(DEAL)).toBeNull();
  });

  it('computeMetrics agrège correctement', () => {
    const m = computeMetrics(DEAL);
    expect(m.cout_total_eur).toBe(2_440_000);
    expect(m.ltv).toBeCloseTo(0.5794, 3);
    expect(m.marge_marchand_eur).toBe(460_000);
    expect(m.dscr).toBeNull();
  });
});

describe('DSCR — variante locative', () => {
  it('DSCR = loyer net / service de la dette = 1,54', () => {
    // 90 000 / (1 460 000 × 0,04) = 90 000 / 58 400 = 1,5411
    const dscr = debtServiceCoverageRatio(IMMEUBLE_LOCATIF);
    expect(dscr).not.toBeNull();
    expect(dscr!).toBeCloseTo(1.5411, 3);
  });

  it('DSCR > cible 1,2', () => {
    expect(debtServiceCoverageRatio(IMMEUBLE_LOCATIF)!).toBeGreaterThan(1.2);
  });
});

describe('checkFundingBalance — détection de déséquilibre', () => {
  it('détecte un trou de financement', () => {
    const trou = {
      ...DEAL,
      funding: { ...DEAL.funding, obligations_cible_eur: 600_000 }, // -140 000
    };
    const b = checkFundingBalance(trou);
    expect(b.equilibre).toBe(false);
    expect(b.ecart_eur).toBe(-140_000);
  });

  it('tolère un écart ≤ 1 € (arrondi)', () => {
    const presque = {
      ...DEAL,
      funding: { ...DEAL.funding, obligations_cible_eur: 740_000.5 },
    };
    expect(checkFundingBalance(presque).equilibre).toBe(true);
  });
});

describe('garde-fous division par zéro', () => {
  it('valeur de référence nulle → LTV = 0 (pas NaN)', () => {
    const z = {
      ...DEAL,
      exit: { prix_revente_central_eur: 0, valeur_expertise_eur: 0 },
    };
    expect(loanToValue(z)).toBe(0);
    expect(Number.isNaN(loanToValue(z))).toBe(false);
  });
});
