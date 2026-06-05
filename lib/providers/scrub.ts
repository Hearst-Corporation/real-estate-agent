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

/** Masque secrets et PII dans une chaîne libre (corps d'erreur, message...). */
export function scrubSecrets(input: string): string {
  if (!input) return input;
  // Ordre important : tokens/emails AVANT KV — sinon `Authorization: Bearer <tok>`
  // verrait KV consommer "Bearer" et laisser le token nu.
  return input
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(KNOWN_PREFIX, '[REDACTED]')
    .replace(EMAIL, '[EMAIL]')
    .replace(KV, (_m, prefix: string, quote: string) => `${prefix}${quote}[REDACTED]${quote}`);
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
