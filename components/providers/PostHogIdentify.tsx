"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Lie les events PostHog à l'utilisateur connecté (distinctId = id user).
 * No-op si PostHog non initialisé (clé absente) — posthog.identify est ignoré
 * tant que posthog.init() n'a pas tourné. On n'envoie QUE l'id (pas d'email/PII).
 */
export default function PostHogIdentify({ distinctId }: { distinctId: string }) {
  useEffect(() => {
    if (!distinctId) return;
    posthog.identify(distinctId);
  }, [distinctId]);

  return null;
}
