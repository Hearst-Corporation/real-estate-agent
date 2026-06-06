import { describe, it, expect } from 'vitest';
import {
  runScenario,
  runAllScenarios,
  sensibilitePrix,
  sensibiliteRetard,
  pointMortPrix,
  prixReventeScenario,
  dureeScenario,
} from './scenarios';
import { RESIDENCE_HAUSSMANN } from './fixtures';

const DEAL = RESIDENCE_HAUSSMANN;

describe('décalages de scénario', () => {
  it('prix de revente pessimiste = central × (1 - 8 %)', () => {
    expect(prixReventeScenario(DEAL, DEAL.scenarios.pessimiste)).toBeCloseTo(
      2_900_000 * 0.92,
      6,
    );
  });

  it('durée pessimiste = 22 + 3 mois de retard', () => {
    expect(dureeScenario(DEAL, DEAL.scenarios.pessimiste)).toBe(25);
  });
});

describe('runScenario — central', () => {
  const central = runScenario(DEAL, 'central', DEAL.scenarios.central);

  it('flux investisseur : -740 000 au closing, + (principal+coupon) à l’exit', () => {
    const cf = central.cashflows_investisseur;
    expect(cf).toHaveLength(2);
    expect(cf[0].montant_eur).toBe(-740_000);
    expect(cf[0].date).toBe('2026-09-01');
    // principal 740 000 + coupon 122 100 = 862 100
    expect(cf[1].montant_eur).toBeCloseTo(862_100, 4);
    expect(cf[1].date).toBe('2028-07-01'); // closing + 22 mois
  });

  it('TRI investisseur central > 0 et raisonnable (cohérent ~9 % cible)', () => {
    expect(central.irr_investisseur.irr).not.toBeNull();
    // total perçu 862 100 sur 740 000 en ~1,83 an → TRI annualisé ≈ 8,6 %
    expect(central.irr_investisseur.irr!).toBeGreaterThan(0.07);
    expect(central.irr_investisseur.irr!).toBeLessThan(0.11);
  });

  it('rendement total central ≈ 16,5 % (862 100 / 740 000 - 1)', () => {
    expect(central.rendement_total_pct).toBeCloseTo(862_100 / 740_000 - 1, 6);
  });
});

describe('runAllScenarios — ordonnancement pess < central < opt', () => {
  const all = runAllScenarios(DEAL);

  it('le coupon obligataire plafonne le rendement obligataire à l’identique tant que tout est servi', () => {
    // Dans les 3 scénarios, le produit couvre senior + principal + coupon
    // obligataire en intégralité → l'obligataire perçoit la même chose en VALEUR
    // (principal + coupon), MAIS le TRI varie via la DURÉE (retard pessimiste).
    expect(all.pessimiste.waterfall.obligataire.perte_capital_eur).toBe(0);
    expect(all.central.waterfall.obligataire.perte_capital_eur).toBe(0);
    expect(all.optimiste.waterfall.obligataire.perte_capital_eur).toBe(0);
  });

  it('le retard pessimiste augmente le coupon dû mais baisse le TRI annualisé', () => {
    // pessimiste a +3 mois → coupon plus élevé en valeur, mais étalé plus longtemps.
    const pessCoupon = all.pessimiste.waterfall.obligataire.coupon_percu_eur;
    const centCoupon = all.central.waterfall.obligataire.coupon_percu_eur;
    expect(pessCoupon).toBeGreaterThan(centCoupon); // 25 mois > 22 mois de coupon
    // TRI annualisé pessimiste < central malgré coupon plus gros (coût du temps)
    expect(all.pessimiste.irr_investisseur.irr!).toBeLessThan(
      all.central.irr_investisseur.irr!,
    );
  });

  it('equity résiduel : optimiste > central > pessimiste (l’upside va au sponsor)', () => {
    expect(all.optimiste.waterfall.equity_residuel_eur).toBeGreaterThan(
      all.central.waterfall.equity_residuel_eur,
    );
    expect(all.central.waterfall.equity_residuel_eur).toBeGreaterThan(
      all.pessimiste.waterfall.equity_residuel_eur,
    );
  });
});

describe('sensibilité prix de revente (graph 6)', () => {
  const points = sensibilitePrix(DEAL, -0.15, 0.15, 0.05);

  it('produit 7 points de -15 % à +15 % par pas de 5 %', () => {
    expect(points).toHaveLength(7);
    expect(points[0].x).toBeCloseTo(-0.15, 6);
    expect(points[points.length - 1].x).toBeCloseTo(0.15, 6);
  });

  it('le rendement obligataire est PLAFONNÉ à la hausse (créancier, pas equity)', () => {
    // Au-delà du point où principal+coupon sont intégralement servis, le
    // rendement obligataire ne monte plus (l'upside va à l'equity).
    const hauts = points.filter((p) => p.x >= 0).map((p) => p.rendement_total_pct);
    const max = Math.max(...hauts);
    const min = Math.min(...hauts);
    expect(max - min).toBeLessThan(1e-6); // plafonné = constant côté positif
  });

  it('monotonie non décroissante du rendement avec le prix', () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].rendement_total_pct).toBeGreaterThanOrEqual(
        points[i - 1].rendement_total_pct - 1e-9,
      );
    }
  });
});

describe('sensibilité retard travaux (graph 7)', () => {
  const points = sensibiliteRetard(DEAL, 0, 12, 3);

  it('produit 5 points de 0 à 12 mois par pas de 3', () => {
    expect(points.map((p) => p.x)).toEqual([0, 3, 6, 9, 12]);
  });

  it('le TRI annualisé DÉCROÎT avec le retard (coût du temps)', () => {
    const irrs = points.map((p) => p.irr!);
    for (let i = 1; i < irrs.length; i++) {
      expect(irrs[i]).toBeLessThan(irrs[i - 1]);
    }
  });
});

describe('point mort prix (marge de sécurité, graph 6)', () => {
  it('existe et est négatif (le prix peut baisser avant perte de TRI)', () => {
    const pm = pointMortPrix(DEAL);
    expect(pm).not.toBeNull();
    // Le deal central est rentable ; le point mort (TRI=0) est une baisse de prix.
    expect(pm!).toBeLessThan(0);
  });

  it('au point mort, le TRI est ≈ 0', () => {
    const pm = pointMortPrix(DEAL)!;
    const res = runScenario(DEAL, 'central', {
      delta_prix_revente_pct: pm,
      retard_mois: 0,
    });
    // TRI ≈ 0 OU principal juste remboursé sans coupon (TRI nul). Tolérance.
    const irr = res.irr_investisseur.irr;
    if (irr !== null) expect(Math.abs(irr)).toBeLessThan(0.02);
  });
});
