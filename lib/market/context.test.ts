import { describe, it, expect } from 'vitest';
import {
  buildMarketQuery,
  summarizeResults,
  toCitations,
  perplexityCitations,
} from './context';
import type { SearchResult } from '@/lib/providers/search';

const sr = (over: Partial<SearchResult>): SearchResult => ({
  title: 't',
  url: 'https://x',
  snippet: 's',
  ...over,
});

describe('market/context', () => {
  it('buildMarketQuery intègre type + ville + CP', () => {
    const q = buildMarketQuery({ property_type: 'appartement', city: 'Lyon', postal_code: '69003' });
    expect(q).toContain('appartement');
    expect(q).toContain('Lyon');
    expect(q).toContain('69003');
  });

  it('toCitations garantit un title non vide (fallback = url) et filtre les sans-url', () => {
    const cites = toCitations(
      [sr({ title: '', url: 'https://a.fr' }), sr({ title: 'B', url: '' }), sr({ title: 'C', url: 'https://c.fr' })],
      5,
    );
    expect(cites).toEqual([
      { title: 'https://a.fr', url: 'https://a.fr' },
      { title: 'C', url: 'https://c.fr' },
    ]);
  });

  it('perplexityCitations normalise des URLs nues en {title,url}', () => {
    const cites = perplexityCitations(['https://insee.fr/x', '', 'https://meilleursagents.fr/y'], 5);
    expect(cites).toEqual([
      { title: 'https://insee.fr/x', url: 'https://insee.fr/x' },
      { title: 'https://meilleursagents.fr/y', url: 'https://meilleursagents.fr/y' },
    ]);
  });

  it('summarizeResults renvoie null si aucun snippet', () => {
    expect(summarizeResults([sr({ snippet: '' }), sr({ snippet: '   ' })])).toBeNull();
    expect(summarizeResults([sr({ snippet: 'tendance haussière' })])).toContain('tendance');
  });
});
