import { describe, it, expect } from 'vitest';
import {
  canGenerate,
  coverageOf,
  nextFocusLabel,
  nextSuggestions,
  inferCriticalFromText,
  TOTAL_KEY_FIELDS,
} from './spec';
import type { PropertyData, FieldStatusMap } from './types';

// Une fiche est partiellement remplie pendant l'entretien : on caste des
// littéraux partiels vers PropertyData (champs absents = non encore collectés).
const P = (o: Partial<PropertyData> = {}): PropertyData => o as PropertyData;
const EMPTY_FS: FieldStatusMap = {};

describe('canGenerate', () => {
  it('exige type + surface + localisation (ville OU adresse)', () => {
    expect(canGenerate(P())).toBe(false);
    expect(canGenerate(P({ type_bien: 'appartement', surface_habitable_m2: 75 }))).toBe(false);
    // localisation via ville
    expect(
      canGenerate(P({ type_bien: 'appartement', surface_habitable_m2: 75, ville: 'Lyon' }))
    ).toBe(true);
    // localisation via adresse seule (ville absente) → suffit
    expect(
      canGenerate(P({ type_bien: 'maison', surface_habitable_m2: 120, adresse: '3 rue X' }))
    ).toBe(true);
  });
});

describe('inferCriticalFromText (backstop déterministe)', () => {
  it('déduit le type de bien quand le modèle l’a oublié', () => {
    expect(inferCriticalFromText('je vends un appartement', P()).type_bien).toBe('appartement');
    expect(inferCriticalFromText('belle maison avec jardin', P()).type_bien).toBe('maison');
    expect(inferCriticalFromText('un studio sympa', P()).type_bien).toBe('appartement');
    expect(inferCriticalFromText('terrain constructible', P()).type_bien).toBe('terrain');
  });

  it('déduit la surface depuis « 75 m² / 80m2 / 90 mètres carrés »', () => {
    expect(inferCriticalFromText('75 m²', P()).surface_habitable_m2).toBe(75);
    expect(inferCriticalFromText('environ 80m2', P()).surface_habitable_m2).toBe(80);
    expect(inferCriticalFromText('90 mètres carrés', P()).surface_habitable_m2).toBe(90);
  });

  it('n’écrase JAMAIS une valeur déjà fournie par le modèle', () => {
    const p = P({ type_bien: 'maison', surface_habitable_m2: 200 });
    const out = inferCriticalFromText('un appartement de 50 m²', p);
    expect(out.type_bien).toBeUndefined();
    expect(out.surface_habitable_m2).toBeUndefined();
  });

  it('ignore les surfaces aberrantes', () => {
    expect(inferCriticalFromText('2 m²', P()).surface_habitable_m2).toBeUndefined();
  });
});

describe('coverage & suggestions', () => {
  it('compte les infos clés traitées (renseignées ou à confirmer)', () => {
    const p = P({ type_bien: 'appartement', surface_habitable_m2: 75 });
    const fs: FieldStatusMap = { ville: 'to_confirm' };
    const cov = coverageOf(p, fs);
    expect(cov.total).toBe(TOTAL_KEY_FIELDS);
    expect(cov.collected).toBe(3); // type + surface + ville(to_confirm)
  });

  it('chips alignés sur le 1er champ prioritaire non traité (fini → options, libre → [])', () => {
    // type_bien manquant → options de type
    expect(nextSuggestions(P(), EMPTY_FS)).toEqual([
      'Appartement', 'Maison', 'Immeuble', 'Local commercial', 'Terrain', 'Autre',
    ]);
    // type connu mais adresse (libre) manquante → pas de chips
    expect(nextSuggestions(P({ type_bien: 'appartement' }), EMPTY_FS)).toEqual([]);
  });

  it('nextFocusLabel pointe le prochain champ à collecter', () => {
    expect(nextFocusLabel(P(), EMPTY_FS)).toBe('Type de bien');
    expect(nextFocusLabel(P({ type_bien: 'appartement' }), EMPTY_FS)).toBe('Adresse');
  });
});
