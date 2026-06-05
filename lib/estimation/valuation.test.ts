import { describe, it, expect } from 'vitest';
import { computeValuation } from './valuation';
import type { PropertyData, DvfComparable } from './types';

// Bien minimal : seuls les champs lus par computeValuation comptent ;
// le reste est null/défaut. Cast partiel assumé (PropertyData a ~77 champs).
function makeProperty(over: Partial<PropertyData> = {}): PropertyData {
  return {
    type_bien: 'appartement',
    surface_habitable_m2: 50,
    surface_carrez_m2: null,
    dpe_classe: 'D',
    etage: null,
    ascenseur: null,
    exposition: null,
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

// date_mutation au dernier trimestre de la série → facteur d'indexation = 1.0
// (prix_m2 inchangé), ce qui rend l'attendu calculable à la main.
function makeComp(prix_m2: number): DvfComparable {
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
  };
}

describe('computeValuation', () => {
  it('est déterministe : mêmes entrées → résultat identique', () => {
    const p = makeProperty();
    const comps = [makeComp(10_000)];
    const a = computeValuation(p, comps, { medianPricePerSqm: 10_000, confidence: 'elevee' });
    const b = computeValuation(p, comps, { medianPricePerSqm: 10_000, confidence: 'elevee' });
    expect(a).toEqual(b);
  });

  it('ancrage prix : bien neutre 50 m² @ 10 000 €/m² → 500 000 € sans ajustement', () => {
    const v = computeValuation(makeProperty(), [makeComp(10_000)], {
      medianPricePerSqm: 10_000,
      confidence: 'elevee',
    });
    expect(v.basePerM2).toBe(10_000);
    expect(v.adjustedPerM2).toBe(10_000); // DPE D vs base D = 0, aucun autre axe
    expect(v.marketValue).toBe(500_000);
    expect(v.lowValue).toBe(475_000); // spread elevee = 5 %
    expect(v.highValue).toBe(525_000);
  });

  it('mode dégradé : aucun comparable → valeurs nulles, confidence indicative', () => {
    const v = computeValuation(makeProperty(), [], { medianPricePerSqm: null, confidence: 'moyenne' });
    expect(v.marketValue).toBe(0);
    expect(v.nbComparables).toBe(0);
    expect(v.confidence).toBe('indicative');
  });
});
