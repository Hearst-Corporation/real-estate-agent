"use client";

/**
 * components/providers/PostHogProvider.tsx
 *
 * Init posthog-js côté navigateur (SSR-safe).
 * - No-op si NEXT_PUBLIC_POSTHOG_KEY absent.
 * - window n'est jamais accédé au top-level (init dans useEffect).
 * - Capture $pageview sur chaque changement de route App Router
 *   via usePathname() + useSearchParams().
 */

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com";

// ─── Tracker de pageview (séparé pour le Suspense boundary) ───────────────

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    // posthog.capture est no-op si posthog n'est pas initialisé
    posthog.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [pathname, searchParams]);

  return null;
}

// ─── Provider principal ────────────────────────────────────────────────────

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !POSTHOG_KEY) return;
    initialized.current = true;

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // App Router gère lui-même les pageviews via PageViewTracker
      capture_pageview: false,
      // Session replay — masquage GLOBAL (RGPD) :
      //   maskAllInputs: true   → tous les <input> masqués.
      //   maskTextSelector: "*" → TOUT le texte affiché est masqué (noms de
      //     clients, montants, CRM, prospection) → jamais en clair dans les replays.
      //   Opt-out d'un élément non-sensible : classe native posthog-js `ph-no-mask`.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
      },
      // Autocapture activé (défaut posthog-js, explicité ici)
      autocapture: true,
      // Respecte les préférences Do Not Track
      respect_dnt: true,
    });
  }, []);

  return (
    <>
      {/* Suspense obligatoire pour useSearchParams() dans App Router */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}
