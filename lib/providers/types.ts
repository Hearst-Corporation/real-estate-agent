/**
 * lib/providers/types.ts — Socle commun des providers externes.
 *
 * Tous les providers de ce dossier suivent le même contrat :
 *   - xxxIsConfigured() → boolean (env lue paresseusement, jamais au module load)
 *   - throw ProviderUnavailableError si appelé sans config
 *   - fail-soft côté caller : on vérifie isConfigured() avant d'appeler.
 */

/** Erreur typée levée quand un provider est appelé sans clé configurée. */
export class ProviderUnavailableError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`Provider "${provider}" non configuré (clé API absente)`);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}

/** Helper : true si toutes les vars passées sont non-vides dans l'env. */
export function envPresent(...vars: string[]): boolean {
  return vars.every((v) => {
    const value = process.env[v];
    return typeof value === "string" && value.length > 0;
  });
}

const DEFAULT_TIMEOUT_MS = 12_000;

/** fetch JSON avec timeout + erreur typée. Pas d'allowlist (hôtes providers variés). */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} sur ${url} — ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
