/**
 * lib/server/observe.ts — Capture des erreurs FATALES vers Sentry.
 *
 * Réservé aux exceptions non récupérables (catch d'un 500, échec de pipeline).
 * NE PAS utiliser pour les cas best-effort tolérés (DPE down, R2 miss, Apify [])
 * ni pour les 4xx attendus — sinon bruit et coût.
 *
 * Fail-soft : no-op si Sentry non configuré, n'échoue jamais la requête.
 * Les messages sont déjà scrubés en amont (Sentry beforeSend, cf lib/providers/scrub).
 */

import * as Sentry from "@sentry/nextjs";
import { sentryIsConfigured } from "@/lib/providers/sentry";

export function captureFatal(err: unknown, route: string): void {
  if (!sentryIsConfigured()) return;
  try {
    Sentry.captureException(err, { tags: { route, severity: "fatal" } });
  } catch {
    // l'observabilité ne doit jamais casser la requête
  }
}
