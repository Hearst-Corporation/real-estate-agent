/**
 * instrumentation-client.ts — Init Sentry côté navigateur (Next 16).
 * No-op si NEXT_PUBLIC_SENTRY_DSN absent.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
