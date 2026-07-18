/**
 * instrumentation.ts — Init Sentry côté serveur (Next 16).
 * No-op si SENTRY_DSN absent → aucun crash en dev sans config.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSecrets } from "./lib/providers/scrub";
import { assertBootEnv } from "./lib/env-check";

// Garde-fou : on ne patche qu'une seule fois même si register() est appelé plusieurs fois.
let _consolePatchApplied = false;

export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    // Fail-fast au boot : refuse de démarrer si une var serveur requise manque
    // (message clair, aucun secret imprimé). Non bloquant pendant `next build`.
    assertBootEnv();

    if (dsn) {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.2,
        environment: process.env.NODE_ENV,
        // Anti-fuite : scrub secrets/PII de tout event avant envoi.
        beforeSend: (event) => scrubSentryEvent(event),
      });
    }

    // Monkey-patch console.error / console.warn pour scrubber les strings PII/secrets.
    if (!_consolePatchApplied) {
      _consolePatchApplied = true;

      const _origError = console.error.bind(console);
      const _origWarn = console.warn.bind(console);

      const scrubArgs = (args: unknown[]): unknown[] =>
        args.map((a) => (typeof a === 'string' ? scrubSecrets(a) : a));

      console.error = (...args: unknown[]) => _origError(...scrubArgs(args));
      console.warn = (...args: unknown[]) => _origWarn(...scrubArgs(args));
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
