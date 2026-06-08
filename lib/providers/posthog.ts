/**
 * lib/providers/posthog.ts — Analytics produit PostHog (serveur).
 *
 * No-op total si NEXT_PUBLIC_POSTHOG_KEY absent → aucun crash en dev sans config.
 * POSTHOG_PERSONAL_API_KEY est SERVER-ONLY — jamais exposé côté client.
 *
 *   posthogIsConfigured()                          → boolean
 *   getPostHogServer()                             → PostHog | null (singleton paresseux)
 *   captureServer(distinctId, event, properties?)  → void (fail-soft)
 *   getServerFeatureFlag(distinctId, flag)         → Promise<boolean | string | undefined>
 *   shutdownPostHog()                              → Promise<void> (flush + shutdown)
 */

import { PostHog } from "posthog-node";
import { envPresent } from "./types";

let _client: PostHog | null | undefined;

export function posthogIsConfigured(): boolean {
  return envPresent("NEXT_PUBLIC_POSTHOG_KEY");
}

/** Singleton paresseux. null si non configuré. */
export function getPostHogServer(): PostHog | null {
  if (_client !== undefined) return _client;
  if (!posthogIsConfigured()) {
    _client = null;
    return null;
  }
  _client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
    // posthog-node bufferise par défaut — on flush explicitement via shutdownPostHog().
    flushAt: 20,
    flushInterval: 10_000,
  });
  return _client;
}

/**
 * Capture un événement côté serveur.
 * No-op (fail-soft) si PostHog non configuré ou si une erreur survient.
 */
export function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const ph = getPostHogServer();
    if (!ph) return;
    ph.capture({ distinctId, event, properties: properties ?? {} });
  } catch {
    // fail-soft : on ne lève jamais d'erreur analytics côté serveur.
  }
}

/**
 * Résout un feature flag côté serveur.
 * Retourne undefined si non configuré ou en cas d'erreur.
 */
export async function getServerFeatureFlag(
  distinctId: string,
  flag: string,
): Promise<boolean | string | undefined> {
  try {
    const ph = getPostHogServer();
    if (!ph) return undefined;
    const value = await ph.isFeatureEnabled(flag, distinctId);
    if (value === undefined || value === null) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Flush + shutdown best-effort du client posthog-node.
 * À appeler dans les Edge/Serverless handlers avant de terminer la requête.
 */
export async function shutdownPostHog(): Promise<void> {
  try {
    const ph = getPostHogServer();
    if (!ph) return;
    await ph.shutdown();
    // Réinitialise le singleton pour permettre un éventuel re-mount (tests).
    _client = undefined;
  } catch {
    // best-effort : jamais de throw.
  }
}
