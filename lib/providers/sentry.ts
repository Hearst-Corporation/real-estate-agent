/**
 * lib/providers/sentry.ts — Helpers Sentry centralisés (fail-soft).
 *
 *   sentryIsConfigured()   → boolean (true si DSN présent)
 *
 * L'init réel se fait dans instrumentation.ts (serveur) et
 * instrumentation-client.ts (navigateur), qui no-op si DSN absent.
 */

import { envPresent } from "./types";

export function sentryIsConfigured(): boolean {
  return envPresent("SENTRY_DSN") || envPresent("NEXT_PUBLIC_SENTRY_DSN");
}
