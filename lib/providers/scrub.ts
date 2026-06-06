/**
 * lib/providers/scrub.ts — Anti-fuite secrets/PII.
 *
 * Les providers externes renvoient parfois, dans leurs corps d'erreur, un écho
 * de la requête (clé API incluse) ou des PII. Ces messages finissent dans les
 * `Error` puis potentiellement dans Sentry / les logs / la réponse client.
 * Ce module nettoie ces chaînes AVANT qu'elles ne sortent.
 */

// Champs sensibles courants en JSON ou query : on garde le nom, on masque la valeur.
const KV =
  /(["']?(?:api[_-]?key|apikey|access[_-]?token|token|secret|password|authorization|x[_-]?api[_-]?key)["']?\s*[=:]\s*)(["']?)[^"'`,&\s}]+\2/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._\-]+/gi;
const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
// Préfixes de clés connus (Anthropic, Hypercli, GitHub, Resend, OpenAI...).
const KNOWN_PREFIX = /\b(?:sk-[A-Za-z0-9._\-]{6,}|hyper_[A-Za-z0-9._\-]{6,}|ghp_[A-Za-z0-9]{6,}|re_[A-Za-z0-9._\-]{6,}|xaat-[A-Za-z0-9._\-]{6,})\b/g;
// Coordonnées GPS : lat/lon avec decimaux (ex: lat=48.8566, lon=2.3522 ou lat:48.8566).
const GPS_KV = /\b(?:lat(?:itude)?|lon(?:gitude)?)\s*[=:]\s*-?\d{1,3}\.\d+/gi;
// Adresses de rue conservatrices (rue/avenue/bd/boulevard/allée/impasse suivis de texte).
const STREET = /\b(?:rue|avenue|av\.|bd\.?|boulevard|allée|impasse|chemin|place|square)\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9 '-]{3,50}/gi;

/** Masque secrets et PII dans une chaîne libre (corps d'erreur, message...). */
export function scrubSecrets(input: string): string {
  if (!input) return input;
  // Ordre important : tokens/emails AVANT KV — sinon `Authorization: Bearer <tok>`
  // verrait KV consommer "Bearer" et laisser le token nu.
  return input
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(KNOWN_PREFIX, '[REDACTED]')
    .replace(EMAIL, '[EMAIL]')
    .replace(GPS_KV, '[GPS_REDACTED]')
    .replace(STREET, '[ADDRESS_REDACTED]')
    .replace(KV, (_m, prefix: string, quote: string) => `${prefix}${quote}[REDACTED]${quote}`);
}

// ─── Clés PII à redacter dans les objets structurés ────────────────────────────

/** Noms de clé (lowercase) dont la VALEUR doit être redactée dans les objets. */
const PII_KEYS = new Set([
  'full_name', 'name', 'firstname', 'lastname', 'email',
  'country', 'nationality',
  'wallet_address', 'onchainid_address', 'address', 'adresse',
  'phone', 'iban',
  'lat', 'lon', 'latitude', 'longitude',
  'birth', 'dob',
]);

/**
 * Deep-clone récursif d'un objet/tableau en redactant :
 * - Toute string → `scrubSecrets`.
 * - Toute valeur dont la clé (lowercased) ∈ PII_KEYS → `"[REDACTED]"`.
 * Pur. Robuste null/undefined/number/boolean.
 */
export function scrubObject(value: unknown, _key?: string): unknown {
  // Si la clé parente est PII, on redacte la valeur directement (toute valeur).
  if (_key !== undefined && PII_KEYS.has(_key.toLowerCase())) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubSecrets(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubObject(item));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubObject(v, k);
    }
    return out;
  }

  // Fallback (symbol, function, etc.) — ne touche pas.
  return value;
}

/** Réduit une URL à origin+path : supprime query (souvent porteuse de clés) et userinfo. */
export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return raw.split('?')[0];
  }
}

/**
 * Nettoie un event Sentry en place (beforeSend) : messages, valeurs d'exception
 * et données de requête. Typé large volontairement (forme Sentry non importée ici).
 */
export function scrubSentryEvent<E>(event: E): E {
  const e = event as unknown as Record<string, unknown>;

  if (typeof e.message === 'string') e.message = scrubSecrets(e.message);

  const exception = e.exception as { values?: Array<{ value?: unknown }> } | undefined;
  if (exception?.values) {
    for (const v of exception.values) {
      if (typeof v.value === 'string') v.value = scrubSecrets(v.value);
    }
  }

  const req = e.request as
    | { query_string?: unknown; data?: unknown; headers?: Record<string, unknown> }
    | undefined;
  if (req) {
    if (typeof req.query_string === 'string') req.query_string = scrubSecrets(req.query_string);
    if (typeof req.data === 'string') req.data = scrubSecrets(req.data);
    if (req.headers) {
      delete req.headers.authorization;
      delete req.headers['x-api-key'];
      delete req.headers.cookie;
    }
  }

  return event;
}
