"use client";

/**
 * components/WebVitals.tsx
 *
 * Reporte les Core Web Vitals vers PostHog via useReportWebVitals (Next.js built-in).
 * - Zéro dépendance supplémentaire : useReportWebVitals est fourni par next/web-vitals.
 * - Fail-soft : no-op si posthog n'est pas initialisé ou si NEXT_PUBLIC_POSTHOG_KEY absent.
 * - Ne capture QUE si posthog.__loaded est truthy (init terminée).
 */

import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export default function WebVitals() {
  useReportWebVitals((metric) => {
    // Guard : pas de clé configurée → no-op
    if (!POSTHOG_KEY) return;
    // Guard : posthog-js pas encore initialisé (init asynchrone dans PostHogProvider)
    if (!posthog.__loaded) return;

    try {
      posthog.capture("web_vital", {
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
      });
    } catch {
      // fail-soft : on ne lève jamais d'erreur analytics
    }
  });

  return null;
}
