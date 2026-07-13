import { describe, it, expect } from 'vitest';
import { capSections, dropGroupedSales, type DvfMutation } from './dvf';

function mut(over: Partial<DvfMutation>): DvfMutation {
  return {
    valeur_fonciere: 200_000,
    type_local: 'Appartement',
    surface_reelle_bati: 50,
    nombre_pieces_principales: 2,
    date_mutation: '2025-01-01',
    latitude: 48.85,
    longitude: 2.35,
    id_parcelle: '75105000AB0001',
    id_mutation: '2025-1',
    nature_mutation: 'Vente',
    ...over,
  };
}

describe('capSections', () => {
  it('<= 4 sections : toutes conservées, ordre préservé', () => {
    const input = ['000AM', '000AN', '000BL', '000BM'];
    expect(capSections(input)).toEqual(['000AM', '000AN', '000BL', '000BM']);
  });

  it('> 4 sections : tronqué à 4, section principale (index 0) conservée', () => {
    const input = ['000AM', '000AN', '000BL', '000BM', '000CA', '000CB', '000CC'];
    const result = capSections(input);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('000AM');
    expect(result).not.toContain('000CA');
  });

  it('doublons dédupliqués avant cap', () => {
    // 3 uniques + doublons → unique=[000AM,000AN,000BL] → aucune truncation
    const input = ['000AM', '000AM', '000AN', '000BL', '000BL'];
    const result = capSections(input);
    expect(result).toEqual(['000AM', '000AN', '000BL']);
  });

  it('liste vide → liste vide', () => {
    expect(capSections([])).toEqual([]);
  });
});

describe('dropGroupedSales', () => {
  it('écarte les 2 lots résidentiels d\'une vente en bloc (même id_mutation)', () => {
    const input = [
      mut({ id_mutation: '2025-1043402', type_local: 'Appartement', surface_reelle_bati: 40 }),
      mut({ id_mutation: '2025-1043402', type_local: 'Appartement', surface_reelle_bati: 55 }),
    ];
    expect(dropGroupedSales(input)).toEqual([]);
  });

  it('conserve une vente résidentielle simple (un seul lot bâti)', () => {
    const input = [mut({ id_mutation: '2025-500', type_local: 'Appartement' })];
    expect(dropGroupedSales(input)).toHaveLength(1);
  });

  it('conserve un appart + une dépendance sous le même id_mutation (1 seul lot résidentiel)', () => {
    const input = [
      mut({ id_mutation: '2025-777', type_local: 'Appartement', surface_reelle_bati: 60 }),
      mut({ id_mutation: '2025-777', type_local: 'Dépendance', surface_reelle_bati: 8 }),
    ];
    const kept = dropGroupedSales(input);
    expect(kept).toHaveLength(2);
    expect(kept.map((m) => m.type_local)).toEqual(['Appartement', 'Dépendance']);
  });
});
