/**
 * instrumentation.ts — Init Sentry côté serveur (Next 16).
 * No-op si SENTRY_DSN absent → aucun crash en dev sans config.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/providers/scrub";

export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      // Anti-fuite : scrub secrets/PII de tout event avant envoi.
      beforeSend: (event) => scrubSentryEvent(event),
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
