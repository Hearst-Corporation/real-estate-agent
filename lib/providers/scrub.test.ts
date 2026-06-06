import { describe, it, expect } from 'vitest';
import { scrubSecrets, safeUrl, scrubSentryEvent, scrubObject } from './scrub';

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

describe('scrubObject', () => {
  it('redacte full_name, email, wallet_address (clés PII)', () => {
    const input = {
      full_name: 'Jean Dupont',
      email: 'jean@dupont.fr',
      wallet_address: '0xABCDEF123456',
      amount: 1500,
      units: 10,
    };
    const out = scrubObject(input) as Record<string, unknown>;
    expect(out.full_name).toBe('[REDACTED]');
    expect(out.email).toBe('[REDACTED]');
    expect(out.wallet_address).toBe('[REDACTED]');
    // Champs non-PII préservés tels quels.
    expect(out.amount).toBe(1500);
    expect(out.units).toBe(10);
  });

  it('redacte les champs PII imbriqués (nested)', () => {
    const input = {
      investor: {
        name: 'Alice',
        address: '12 rue de la Paix',
        phone: '+33612345678',
        profile: {
          dob: '1990-01-01',
          nationality: 'FR',
        },
      },
      deal_id: 'abc-123',
    };
    const out = scrubObject(input) as Record<string, unknown>;
    const investor = out.investor as Record<string, unknown>;
    expect(investor.name).toBe('[REDACTED]');
    expect(investor.address).toBe('[REDACTED]');
    expect(investor.phone).toBe('[REDACTED]');
    const profile = investor.profile as Record<string, unknown>;
    expect(profile.dob).toBe('[REDACTED]');
    expect(profile.nationality).toBe('[REDACTED]');
    // Non-PII préservé.
    expect(out.deal_id).toBe('abc-123');
  });

  it('scrub les secrets dans les strings (même hors clés PII)', () => {
    const input = { message: 'api_key=supersecret123 error', code: 500 };
    const out = scrubObject(input) as Record<string, unknown>;
    expect(out.message as string).not.toContain('supersecret123');
    expect(out.message as string).toContain('[REDACTED]');
    expect(out.code).toBe(500);
  });

  it('gère les tableaux (redacte les éléments PII du tableau)', () => {
    const input = [
      { full_name: 'Bob', amount: 100 },
      { email: 'bob@example.com', status: 'active' },
    ];
    const out = scrubObject(input) as Array<Record<string, unknown>>;
    expect(out[0].full_name).toBe('[REDACTED]');
    expect(out[0].amount).toBe(100);
    expect(out[1].email).toBe('[REDACTED]');
    expect(out[1].status).toBe('active');
  });

  it("ne lève pas pour les non-objets (null, undefined, number, boolean)", () => {
    expect(() => scrubObject(null)).not.toThrow();
    expect(() => scrubObject(undefined)).not.toThrow();
    expect(() => scrubObject(42)).not.toThrow();
    expect(() => scrubObject(true)).not.toThrow();
    expect(scrubObject(null)).toBeNull();
    expect(scrubObject(undefined)).toBeUndefined();
    expect(scrubObject(42)).toBe(42);
    expect(scrubObject(true)).toBe(true);
  });

  it('ne modifie pas un objet sans PII ni secret', () => {
    const input = { status: 'open', amount: 5000, ok: true };
    const out = scrubObject(input) as Record<string, unknown>;
    expect(out.status).toBe('open');
    expect(out.amount).toBe(5000);
    expect(out.ok).toBe(true);
  });
});
