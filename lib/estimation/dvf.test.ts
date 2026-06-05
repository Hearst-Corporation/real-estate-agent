import { describe, it, expect } from 'vitest';
import { capSections } from './dvf';

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
