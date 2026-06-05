import { ALLOWED_HOSTS } from './endpoints';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Fetch sécurisé restreint aux hôtes autorisés dans ALLOWED_HOSTS.
 * - Rejette toute URL dont l'hôte n'est pas dans la liste blanche.
 * - Timeout configurable (défaut 8 s).
 * - Refuse les redirections (throw sur 3xx).
 * - Limite la taille de la réponse (défaut 2 MiB).
 */
export async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number; maxBytes?: number },
): Promise<Response> {
  // Parse & allowlist check
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`safeFetch: URL invalide — "${url}"`);
  }

  const host = parsed.hostname;
  if (!(ALLOWED_HOSTS as readonly string[]).includes(host)) {
    throw new Error(
      `safeFetch: hôte non autorisé — "${host}". Hôtes autorisés : ${ALLOWED_HOSTS.join(', ')}`,
    );
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, ...fetchInit } = init ?? {};

  // AbortController pour le timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // Reject redirects
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `safeFetch: redirection non autorisée (${response.status}) vers "${response.headers.get('location') ?? '(inconnu)'}"`,
    );
  }

  // Cap taille via Content-Length header
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      throw new Error(
        `safeFetch: réponse trop volumineuse — ${length} octets > limite ${maxBytes} octets`,
      );
    }
  }

  // Si pas de Content-Length, on clone + lit en contrôlant la taille
  // On retourne un Response synthétique avec le body limité
  if (contentLength === null && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalRead += value.byteLength;
      if (totalRead > maxBytes) {
        await reader.cancel();
        throw new Error(
          `safeFetch: réponse trop volumineuse — dépasse la limite de ${maxBytes} octets`,
        );
      }
      chunks.push(value);
    }

    // Reconstitue un Response avec le body lu
    const combined = new Uint8Array(totalRead);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(combined, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return response;
}
