import { describe, it, expect } from 'vitest';
import { computeValuation, ENGINE_VERSION } from './valuation';
import { indexFactor } from './price-index';
import type { PropertyData, DvfComparable } from './types';

// Bien neutre : DPE D (= base comps D → 0 ajustement DPE), 50 m², appartement.
// Seuls les champs sur-écrits déclenchent un axe. Cast partiel assumé.
function makeProperty(over: Partial<PropertyData> = {}): PropertyData {
  return {
    type_bien: 'appartement',
    surface_habitable_m2: 50,
    surface_carrez_m2: null,
    dpe_classe: 'D',
    etage: null,
    ascenseur: null,
    exposition: null,
    vue: null,
    etat_general: null,
    hauteur_sous_plafond_m: null,
    standing_style: null,
    prestations: null,
    travaux_votes: null,
    charges_annuelles_eur: null,
    occupation: null,
    stationnement: null,
    nb_stationnements: null,
    cave: null,
    terrasse_balcon_m2: null,
    jardin_m2: null,
    ...over,
  } as unknown as PropertyData;
}

// 2026-Q2 = dernier trimestre de NATIONAL_INDEX → facteur d'indexation 1.0.
// prix_m2 inchangé, attendu calculable à la main.
function makeComp(prix_m2: number, over: Partial<DvfComparable> = {}): DvfComparable {
  return {
    id: 'c1',
    date_mutation: '2026-06-01',
    adresse: 'Parcelle 0001',
    code_postal: '',
    ville: '',
    surface_reelle_bati: 50,
    valeur_fonciere: prix_m2 * 50,
    prix_m2,
    type_local: 'Appartement',
    nombre_pieces: 3,
    ...over,
  };
}

// Base value d'un bien neutre 50 m² @ 10 000 €/m² = 500 000 € (aucun ajustement).
const BASE = { property: () => makeProperty(), comps: () => [makeComp(10_000)] };
const OPTS = { medianPricePerSqm: 10_000, confidence: 'elevee' as const };

function value(over: Partial<PropertyData>) {
  return computeValuation(makeProperty(over), BASE.comps(), OPTS);
}

describe('computeValuation — champ engineVersion', () => {
  it('expose ENGINE_VERSION dans la sortie', () => {
    const v = computeValuation(BASE.property(), BASE.comps(), OPTS);
    expect(v.engineVersion).toBe(ENGINE_VERSION);
    expect(v.engineVersion).toMatch(/^valuation@\d+\.\d+\.\d+$/);
  });

  it('présent même en mode dégradé (0 comparable)', () => {
    const v = computeValuation(BASE.property(), [], { medianPricePerSqm: null, confidence: 'indicative' });
    expect(v.engineVersion).toBe(ENGINE_VERSION);
    expect(v.dataStatus).toBe('degraded');
  });
});

describe('computeValuation — axes d’ajustement individuels', () => {
  it('DPE appartement : classe A applique +16% vs base D', () => {
    const v = value({ dpe_classe: 'A' });
    const adj = v.adjustments.find((a) => a.label.startsWith('DPE'));
    expect(adj?.pct).toBe(16);
    expect(adj?.type).toBe('premium');
    // 10 000 × 1.16 = 11 600 → 580 000 €
    expect(v.adjustedPerM2).toBe(11_600);
  });

  it('DPE maison : classe G applique -25% vs base D (table maison distincte)', () => {
    const v = computeValuation(
      makeProperty({ type_bien: 'maison', dpe_classe: 'G' }),
      BASE.comps(),
      OPTS,
    );
    const adj = v.adjustments.find((a) => a.label.startsWith('DPE'));
    expect(adj?.pct).toBe(-25);
    expect(adj?.type).toBe('discount');
  });

  it('Étage élevé sans ascenseur : -7%', () => {
    const v = value({ etage: 4, ascenseur: false });
    const adj = v.adjustments.find((a) => a.label.includes('sans ascenseur'));
    expect(adj?.pct).toBe(-7);
  });

  it('Rez-de-chaussée : -5%', () => {
    const v = value({ etage: 0 });
    expect(v.adjustments.find((a) => a.label === 'Rez-de-chaussée')?.pct).toBe(-5);
  });

  it('État à rénover : -15%', () => {
    const v = value({ etat_general: 'a_renover' });
    expect(v.adjustments.find((a) => a.label === 'À rénover')?.pct).toBe(-15);
    // 10 000 × 0.85 = 8 500
    expect(v.adjustedPerM2).toBe(8_500);
  });

  it('Standing luxe : +15%', () => {
    const v = value({ standing_style: 'luxe' });
    expect(v.adjustments.find((a) => a.label.includes('luxe'))?.pct).toBe(15);
  });

  it('Vue mer panoramique : +18%', () => {
    const v = value({ vue: 'vue mer panoramique' });
    const adj = v.adjustments.find((a) => a.label.includes('Vue mer'));
    expect(adj?.pct).toBe(18);
  });

  it('Occupation louée : décote liquidité -5%', () => {
    const v = value({ occupation: 'loue' });
    expect(v.adjustments.find((a) => a.label.includes('loué'))?.pct).toBe(-5);
  });
});

describe('computeValuation — clamp total ±25%', () => {
  it('cumul de premiums plafonné à +25%', () => {
    // DPE A (+16) + luxe (+15) + vue mer pano (+18) + traversant (+3) = +52% → clamp +25%
    const v = value({
      dpe_classe: 'A',
      standing_style: 'luxe',
      vue: 'vue mer panoramique',
      exposition: 'traversant',
    });
    // 10 000 × 1.25 = 12 500
    expect(v.adjustedPerM2).toBe(12_500);
  });

  it('cumul de discounts plancher à -25%', () => {
    // à rénover (-15) + DPE G (-7 appart) + nord (-3) + loué (-5) + RDC (-5) = -35% → clamp -25%
    const v = value({
      etat_general: 'a_renover',
      dpe_classe: 'G',
      exposition: 'nord',
      occupation: 'loue',
      etage: 0,
    });
    // 10 000 × 0.75 = 7 500
    expect(v.adjustedPerM2).toBe(7_500);
  });
});

describe('computeValuation — annexes en € absolu (hors clamp)', () => {
  it('box/garage ajoute 12 000 € en absolu', () => {
    const base = computeValuation(BASE.property(), BASE.comps(), OPTS).marketValue;
    const v = value({ stationnement: 'box' });
    expect(v.marketValue - base).toBe(12_000);
  });

  it('cave ajoute 4 000 €', () => {
    const base = computeValuation(BASE.property(), BASE.comps(), OPTS).marketValue;
    const v = value({ cave: true });
    expect(v.marketValue - base).toBe(4_000);
  });

  it('piscine ajoute 30 000 €', () => {
    const base = computeValuation(BASE.property(), BASE.comps(), OPTS).marketValue;
    const v = value({ prestations: ['piscine chauffée'] });
    expect(v.marketValue - base).toBe(30_000);
  });

  it('terrasse : 0.4 × adjustedPerM2 × surface (10 m² @ 10 000 = 40 000 €)', () => {
    const base = computeValuation(BASE.property(), BASE.comps(), OPTS).marketValue;
    const v = value({ terrasse_balcon_m2: 10 });
    expect(v.marketValue - base).toBe(40_000);
  });
});

describe('indexation temporelle (indexFactor / indexComparable)', () => {
  it('dernier trimestre de la série → facteur 1.0', () => {
    expect(indexFactor('2026-06-01')).toBe(1.0);
  });

  it('vente ancienne (2020-Q1) → facteur haussier clampé à 1.20', () => {
    // 122.6 / 100.0 = 1.226 → clampé à 1.20
    expect(indexFactor('2020-01-15')).toBe(1.2);
  });

  it('comp daté remonte le prix/m² de base (marché haussier)', () => {
    // Comp @ 10 000 daté 2020-Q1 → indexé ×1.20 = 12 000 → base médiane 12 000
    const v = computeValuation(BASE.property(), [makeComp(10_000, { date_mutation: '2020-01-15' })], OPTS);
    expect(v.basePerM2).toBe(12_000);
  });
});

describe('confiance mesurable & data_status (déterminisme)', () => {
  it('data_status complete : géoloc + ≥3 comparables', () => {
    const comps = [makeComp(10_000), makeComp(10_200), makeComp(9_800)];
    const v = computeValuation(BASE.property(), comps, { ...OPTS, geocoded: true });
    expect(v.dataStatus).toBe('complete');
    expect(v.confidenceFactors.nbComparables).toBe(3);
  });

  it('data_status partial : géoloc OK mais <3 comparables', () => {
    const v = computeValuation(BASE.property(), [makeComp(10_000)], { ...OPTS, geocoded: true });
    expect(v.dataStatus).toBe('partial');
  });

  it('data_status degraded : géocodage échoué', () => {
    const v = computeValuation(BASE.property(), [makeComp(10_000)], { ...OPTS, geocoded: false });
    expect(v.dataStatus).toBe('degraded');
  });

  it('coefficient de variation calculé sur les prix/m² indexés', () => {
    const comps = [makeComp(9_000), makeComp(10_000), makeComp(11_000)];
    const v = computeValuation(BASE.property(), comps, OPTS);
    expect(v.confidenceFactors.cvPrixM2).not.toBeNull();
    expect(v.confidenceFactors.cvPrixM2).toBeGreaterThan(0);
    // CV = std(9000,10000,11000)/median = 816.5.../10000 ≈ 0.082
    expect(v.confidenceFactors.cvPrixM2).toBeCloseTo(0.082, 2);
  });

  it('récence moyenne dérivée de refNowIso (déterministe, pas de Date.now)', () => {
    const comps = [makeComp(10_000, { date_mutation: '2025-06-01' })];
    const v = computeValuation(BASE.property(), comps, { ...OPTS, refNowIso: '2026-06-01' });
    expect(v.confidenceFactors.recenceMoyenneMois).toBe(12);
  });

  it('déterministe : mêmes entrées (avec refNowIso) → confidenceFactors identiques', () => {
    const comps = [makeComp(9_500), makeComp(10_500)];
    const opts = { ...OPTS, refNowIso: '2026-06-01', distanceMoyenneKm: 0.5, geocoded: true };
    const a = computeValuation(BASE.property(), comps, opts);
    const b = computeValuation(BASE.property(), comps, opts);
    expect(a.confidenceFactors).toEqual(b.confidenceFactors);
    expect(a.dataStatus).toBe(b.dataStatus);
  });
});
