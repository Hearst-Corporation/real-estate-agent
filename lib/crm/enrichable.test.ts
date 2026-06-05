import { describe, it, expect } from 'vitest';
import { isEnrichable } from './enrichable';

describe('isEnrichable (garde RGPD allow-list)', () => {
  it('autorise uniquement pro/societe/sci/agence', () => {
    expect(isEnrichable('professionnel')).toBe(true);
    expect(isEnrichable('societe')).toBe(true);
    expect(isEnrichable('sci')).toBe(true);
    expect(isEnrichable('agence')).toBe(true);
  });

  it('refuse particulier', () => {
    expect(isEnrichable('particulier')).toBe(false);
  });

  it('refuse null/undefined/inconnu (deny par défaut)', () => {
    expect(isEnrichable(null)).toBe(false);
    expect(isEnrichable(undefined)).toBe(false);
    expect(isEnrichable('')).toBe(false);
    expect(isEnrichable('autre')).toBe(false);
  });
});
