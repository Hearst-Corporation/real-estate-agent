import { describe, it, expect } from 'vitest';
import {
  computeWaterfall,
  couponObligataireDu,
  interetsSeniorDus,
} from './waterfall';
import { RESIDENCE_HAUSSMANN } from './fixtures';
import type { WaterfallTier, WaterfallTierKey } from './types';

/**
 * Tests du WATERFALL. Cas chiffré de référence = "Résidence Haussmann" (P7),
 * scénario central (prix 2 900 000 €, durée 22 mois). Tous les montants sont
 * recalculés À LA MAIN dans les commentaires.
 */

const DEAL = RESIDENCE_HAUSSMANN;

function tierOf(tiers: WaterfallTier[], key: WaterfallTierKey): WaterfallTier {
  const t = tiers.find((x) => x.key === key);
  if (!t) throw new Error(`Tier introuvable: ${key}`);
  return t;
}

describe('helpers intérêts simples', () => {
  it('coupon obligataire = principal × taux × durée/12', () => {
    // 740 000 × 0,09 × 22/12 = 122 100
    expect(couponObligataireDu(740_000, 0.09, 22)).toBeCloseTo(122_100, 6);
  });

  it('intérêts senior = principal × taux × durée/12', () => {
    // 1 460 000 × 0,045 × 22/12 = 120 450
    expect(interetsSeniorDus(1_460_000, 0.045, 22)).toBeCloseTo(120_450, 6);
  });
});

describe('computeWaterfall — Résidence Haussmann, scénario central', () => {
  const w = computeWaterfall(DEAL, 2_900_000, 22);

  it('1. dette senior principal : 1 460 000 intégralement remboursée', () => {
    const t = tierOf(w.tiers, 'dette_senior_principal');
    expect(t.du_eur).toBeCloseTo(1_460_000, 6);
    expect(t.paye_eur).toBeCloseTo(1_460_000, 6);
    expect(t.shortfall_eur).toBe(0);
    // Solde après = 2 900 000 - 1 460 000 = 1 440 000
    expect(t.solde_apres_eur).toBeCloseTo(1_440_000, 6);
  });

  it('1bis. intérêts senior : 120 450 €', () => {
    const t = tierOf(w.tiers, 'dette_senior_interets');
    expect(t.paye_eur).toBeCloseTo(120_450, 6);
    // 1 440 000 - 120 450 = 1 319 550
    expect(t.solde_apres_eur).toBeCloseTo(1_319_550, 6);
  });

  it('2. principal obligataire : 740 000 intégralement remboursé', () => {
    const t = tierOf(w.tiers, 'obligations_principal');
    expect(t.paye_eur).toBeCloseTo(740_000, 6);
    expect(t.shortfall_eur).toBe(0);
    // 1 319 550 - 740 000 = 579 550
    expect(t.solde_apres_eur).toBeCloseTo(579_550, 6);
  });

  it('3. coupon obligataire : 122 100 €', () => {
    const t = tierOf(w.tiers, 'obligations_coupon');
    expect(t.paye_eur).toBeCloseTo(122_100, 6);
    // 579 550 - 122 100 = 457 450
    expect(t.solde_apres_eur).toBeCloseTo(457_450, 6);
  });

  it('4a. frais plateforme : 1 % + 0,5 %/an × 22/12 = 14 183,33 €', () => {
    const t = tierOf(w.tiers, 'frais_plateforme');
    // 740 000 × 0,01 = 7 400 ; 740 000 × 0,005 × 22/12 = 6 783,33 ; total 14 183,33
    expect(t.paye_eur).toBeCloseTo(14_183.333_33, 4);
    expect(t.solde_apres_eur).toBeCloseTo(443_266.666_67, 4);
  });

  it('4b. frais opérateur : 2 % de 1 800 000 = 36 000 €', () => {
    const t = tierOf(w.tiers, 'frais_operateur');
    expect(t.paye_eur).toBeCloseTo(36_000, 6);
    // 443 266,67 - 36 000 = 407 266,67
    expect(t.solde_apres_eur).toBeCloseTo(407_266.666_67, 4);
  });

  it('5. carried : 20 % de la sur-performance au-delà du hurdle', () => {
    const t = tierOf(w.tiers, 'carried_operateur');
    // seuil hurdle = 240 000 × (1 + 0,08 × 22/12) = 240 000 × 1,146667 = 275 200
    // surplus = 407 266,67 - 275 200 = 132 066,67
    // carried = 132 066,67 × 0,20 = 26 413,33
    expect(t.paye_eur).toBeCloseTo(26_413.333_33, 4);
    expect(t.solde_apres_eur).toBeCloseTo(380_853.333_33, 4);
  });

  it('6. equity sponsor : reçoit le solde résiduel = 380 853,33 €', () => {
    const t = tierOf(w.tiers, 'equity_sponsor');
    expect(t.paye_eur).toBeCloseTo(380_853.333_33, 4);
    expect(w.equity_residuel_eur).toBeCloseTo(380_853.333_33, 4);
  });

  it('synthèse obligataire : principal + coupon, multiple, pas de perte', () => {
    expect(w.obligataire.principal_rembourse_eur).toBeCloseTo(740_000, 6);
    expect(w.obligataire.coupon_percu_eur).toBeCloseTo(122_100, 6);
    expect(w.obligataire.total_percu_eur).toBeCloseTo(862_100, 6);
    // multiple = 862 100 / 740 000 = 1,165
    expect(w.obligataire.multiple_sur_capital).toBeCloseTo(1.165, 6);
    expect(w.obligataire.perte_capital_eur).toBe(0);
  });

  it('conservation : somme des paiements = produit de revente', () => {
    const totalPaye = w.tiers.reduce((s, t) => s + t.paye_eur, 0);
    expect(totalPaye).toBeCloseTo(2_900_000, 4);
  });
});

describe('computeWaterfall — subordination sous stress', () => {
  it('produit insuffisant : le senior est servi AVANT l’obligataire', () => {
    // Revente catastrophe = 1 500 000 : couvre le principal senior (1 460 000)
    // + une part des intérêts, rien pour l'obligataire.
    const w = computeWaterfall(DEAL, 1_500_000, 22);
    expect(tierOf(w.tiers, 'dette_senior_principal').paye_eur).toBeCloseTo(1_460_000, 6);
    // intérêts senior dus 120 450, solde dispo 40 000 → partiellement servis
    const ti = tierOf(w.tiers, 'dette_senior_interets');
    expect(ti.paye_eur).toBeCloseTo(40_000, 6);
    expect(ti.shortfall_eur).toBeCloseTo(80_450, 6);
    // obligataire : RIEN
    expect(w.obligataire.total_percu_eur).toBe(0);
    expect(w.obligataire.perte_capital_eur).toBeCloseTo(740_000, 6);
    expect(w.equity_residuel_eur).toBe(0);
  });

  it('perte partielle obligataire : principal rationné, coupon = 0', () => {
    // Revente 2 000 000 : senior (1 460 000 + 120 450) servis = 1 580 450 ;
    // reste 419 550 pour l'obligataire (principal dû 740 000) → partiel, pas de coupon.
    const w = computeWaterfall(DEAL, 2_000_000, 22);
    const tp = tierOf(w.tiers, 'obligations_principal');
    expect(tp.paye_eur).toBeCloseTo(419_550, 6);
    expect(tp.shortfall_eur).toBeCloseTo(320_450, 6);
    expect(w.obligataire.coupon_percu_eur).toBe(0);
    expect(w.obligataire.perte_capital_eur).toBeCloseTo(320_450, 6);
    expect(w.equity_residuel_eur).toBe(0);
  });

  it('produit nul : tout le monde à zéro, aucun montant négatif', () => {
    const w = computeWaterfall(DEAL, 0, 22);
    for (const t of w.tiers) {
      expect(t.paye_eur).toBe(0);
      expect(t.paye_eur).toBeGreaterThanOrEqual(0);
      expect(t.solde_apres_eur).toBeGreaterThanOrEqual(0);
    }
    expect(w.obligataire.total_percu_eur).toBe(0);
  });
});

describe('computeWaterfall — carried sous le hurdle', () => {
  it('pas de carried si l’equity résiduel ne dépasse pas le hurdle', () => {
    // Revente calibrée pour que l'equity avant carried ≈ hurdle.
    // seuil hurdle = 275 200. On vise un solde avant carried < 275 200.
    // Senior+oblig+frais consomment ~2 372 733 (principal+int+oblig+coupon+frais).
    // Pour equity avant carried = 200 000 < 275 200 : produit ≈ 2 572 733.
    const w = computeWaterfall(DEAL, 2_572_733, 22);
    const carried = w.tiers.find((t) => t.key === 'carried_operateur')!;
    expect(carried.paye_eur).toBe(0);
  });
});
