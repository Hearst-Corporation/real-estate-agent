import { describe, it, expect } from 'vitest';
import { buildSourcesSnapshot } from './snapshot';

const TS = '2026-06-05T00:00:00.000Z';

describe('buildSourcesSnapshot', () => {
  it('branche dégradée : geo null, snapshot minimal auditable', () => {
    const s = buildSourcesSnapshot({ adresse: '10 rue X, Lyon', geo: null }, TS);
    expect(s.geo).toBeNull();
    expect(s.adresse).toBe('10 rue X, Lyon');
    expect(s.fetched_at).toBe(TS);
    expect(s.dvf.count).toBe(0);
    expect(s.truncated).toBe(false);
  });

  it('conserve les counts et un échantillon borné (50)', () => {
    const mutations = Array.from({ length: 120 }, (_, i) => ({ id: i, v: 100000 + i }));
    const s = buildSourcesSnapshot({ mutations, geo: { lat: 45, lon: 4 } }, TS);
    expect(s.dvf.count).toBe(120);
    expect(s.dvf.sample.length).toBe(50);
  });

  it('tronque le sample DVF si la taille sérialisée dépasse le cap', () => {
    // chaque mutation ~ grosse string → dépasse 512 KB avec 50 échantillons
    const big = 'x'.repeat(20_000);
    const mutations = Array.from({ length: 50 }, (_, i) => ({ id: i, blob: big }));
    const s = buildSourcesSnapshot({ mutations }, TS);
    expect(s.dvf.count).toBe(50); // count préservé
    expect(s.dvf.sample.length).toBe(0); // sample tronqué
    expect(s.truncated).toBe(true);
  });
});
