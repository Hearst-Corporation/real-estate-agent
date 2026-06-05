import { describe, it, expect } from 'vitest';
import { scrubSecrets, safeUrl, scrubSentryEvent } from './scrub';

describe('scrubSecrets', () => {
  it('masque api_key en JSON (écho de requête Apollo)', () => {
    const out = scrubSecrets('{"api_key":"abcdef123456","email":"x"}');
    expect(out).not.toContain('abcdef123456');
    expect(out).toContain('[REDACTED]');
  });

  it('masque api_key en query string', () => {
    const out = scrubSecrets('error for api_key=secretvalue123 in request');
    expect(out).not.toContain('secretvalue123');
    expect(out).toContain('[REDACTED]');
  });

  it('masque Bearer, préfixes connus et emails', () => {
    const out = scrubSecrets('Authorization: Bearer xyz.123-abc | sk-AbCdEf123456 | jean@dupont.fr');
    expect(out).not.toContain('xyz.123-abc');
    expect(out).not.toContain('sk-AbCdEf123456');
    expect(out).not.toContain('jean@dupont.fr');
    expect(out).toContain('[EMAIL]');
  });

  it('chaîne sans secret reste lisible', () => {
    expect(scrubSecrets('HTTP 500 Internal Server Error')).toBe('HTTP 500 Internal Server Error');
  });
});

describe('safeUrl', () => {
  it('supprime la query (porteuse de clés/PII)', () => {
    expect(safeUrl('https://api.peopledatalabs.com/v5/person/enrich?email=a@b.fr&api_key=zzz'))
      .toBe('https://api.peopledatalabs.com/v5/person/enrich');
  });
  it('tolère une URL invalide', () => {
    expect(safeUrl('not a url?x=1')).toBe('not a url');
  });
});

describe('scrubSentryEvent', () => {
  it('scrube la valeur des exceptions et retire les headers sensibles', () => {
    const event = {
      exception: { values: [{ value: 'fail with api_key=topsecret999' }] },
      request: { headers: { authorization: 'Bearer z', 'x-api-key': 'k', accept: 'json' } },
    };
    const out = scrubSentryEvent(event);
    expect(out.exception.values[0].value).not.toContain('topsecret999');
    expect(out.request.headers.authorization).toBeUndefined();
    expect(out.request.headers['x-api-key']).toBeUndefined();
    expect(out.request.headers.accept).toBe('json');
  });
});
