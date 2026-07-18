"use client";

/**
 * Résolution route-aware de la visite d'une page (REA-ONBOARDING-011 ; REA-UX-012).
 * =================================================================
 *
 * REA-UX-012 (LOT 1) — `PageTourButton` n'est plus rendu comme commande globale
 * indépendante posée sur le shell. Sa LOGIQUE route-aware est conservée et
 * réutilisée : `tourForPath` mappe la route courante à la visite correspondante,
 * et l'action « Découvrir cette page » vit désormais dans `HelpPanel` (section
 * « Cette page »). Sur une page sans visite, le panneau explique sobrement que
 * les visites générales restent disponibles — jamais de bouton mort.
 */

import type { TourKey } from "@/lib/onboarding/types";

/**
 * Route prioritaire → visite associée. Le préfixe le plus long gagne, pour que
 * `/prospection/...` ne soit pas capté par `/`.
 */
const PAGE_TOURS: ReadonlyArray<{ prefix: string; tour: TourKey }> = [
  { prefix: "/prospection", tour: "prospection" },
  { prefix: "/offmarket", tour: "offmarket" },
  { prefix: "/estimations", tour: "estimations" },
  { prefix: "/outbox", tour: "communications-hitl" },
  { prefix: "/approvals", tour: "communications-hitl" },
  { prefix: "/agents", tour: "agents" },
  { prefix: "/leads", tour: "crm" },
  { prefix: "/properties", tour: "crm" },
  { prefix: "/visits", tour: "crm" },
  { prefix: "/mandates", tour: "crm" },
  { prefix: "/", tour: "core-cockpit" },
];

/** Visite associée à une route, ou `null` si la route n'est pas prioritaire. */
export function tourForPath(pathname: string): TourKey | null {
  const match = PAGE_TOURS.find(({ prefix }) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match.tour : null;
}
