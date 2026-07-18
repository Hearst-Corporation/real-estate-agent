"use client";

/**
 * « Découvrir cette page » — action SECONDAIRE et discrète (LOT 7).
 * =================================================================
 *
 * Route-aware VOLONTAIREMENT : plutôt que d'ajouter un bouton dans le header de
 * chaque page (bruit visuel + une édition par page), un seul montage dans le
 * shell résout la visite correspondant à la route courante. Sur les pages sans
 * visite livrée, le composant ne rend RIEN — aucun lanceur mort.
 *
 * Masqué sous `sm` : sur mobile, l'entrée globale « Aide et visites guidées »
 * suffit, et l'écran n'a pas de place à gaspiller.
 */

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { TourKey } from "@/lib/onboarding/types";
import { UI } from "@/lib/ui-strings";
import { useProductTour } from "./ProductTourProvider";

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

export function PageTourButton() {
  const pathname = usePathname();
  const { availableTours, startTour, resumeTour, statusOf, tourActive } = useProductTour();

  const key = tourForPath(pathname ?? "");
  // Visite non livrée pour cette route, ou visite déjà en cours → rien à montrer.
  if (!key || tourActive) return null;
  if (!availableTours.some((d) => d.key === key)) return null;

  const status = statusOf(key);

  return (
    <Button
      plain
      className="max-sm:hidden"
      onClick={() => (status === "running" ? resumeTour(key) : startTour(key))}
      aria-label={UI.onboarding.help.pageTour}
    >
      <span className="text-xs">{UI.onboarding.help.pageTour}</span>
    </Button>
  );
}
