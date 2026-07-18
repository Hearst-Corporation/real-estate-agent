/**
 * Product tour — géométrie PURE du placement de la pancarte (LOT 1).
 * =================================================================
 *
 * Zéro DOM : on reçoit un rectangle de cible, une taille de pancarte et un
 * viewport, on renvoie des coordonnées. Testable en Node, rejoué à chaque
 * redimensionnement / changement d'orientation / scroll par le moteur.
 */

import type { TourPlacement, TourRect } from "./types";

/** Écart entre la cible et la pancarte (px, échelle fixe). */
export const COACH_GAP = 12;

/** Marge minimale entre la pancarte et le bord du viewport (px). */
export const VIEWPORT_MARGIN = 16;

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Côtés testés dans l'ordre quand `placement` vaut `auto`. */
const AUTO_ORDER: readonly Exclude<TourPlacement, "auto" | "center">[] = [
  "bottom",
  "top",
  "right",
  "left",
];

export interface CoachPosition {
  top: number;
  left: number;
  /** Côté effectivement retenu (`center` = pancarte centrée à l'écran). */
  side: Exclude<TourPlacement, "auto">;
}

/** Borne une valeur dans `[min, max]` (tolère max < min → renvoie min). */
export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Élargit un rectangle d'une marge uniforme. */
export function inflateRect(rect: TourRect, padding: number): TourRect {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/** Position centrée à l'écran (repli universel). */
export function centerPosition(size: Size, viewport: Viewport): CoachPosition {
  return {
    top: Math.max(VIEWPORT_MARGIN, Math.round((viewport.height - size.height) / 2)),
    left: Math.max(VIEWPORT_MARGIN, Math.round((viewport.width - size.width) / 2)),
    side: "center",
  };
}

/** Le côté demandé laisse-t-il assez de place hors de la cible ? */
function fitsOn(
  side: Exclude<TourPlacement, "auto" | "center">,
  rect: TourRect,
  size: Size,
  viewport: Viewport,
): boolean {
  switch (side) {
    case "bottom":
      return rect.top + rect.height + COACH_GAP + size.height + VIEWPORT_MARGIN <= viewport.height;
    case "top":
      return rect.top - COACH_GAP - size.height - VIEWPORT_MARGIN >= 0;
    case "right":
      return rect.left + rect.width + COACH_GAP + size.width + VIEWPORT_MARGIN <= viewport.width;
    case "left":
      return rect.left - COACH_GAP - size.width - VIEWPORT_MARGIN >= 0;
  }
}

function placeOn(
  side: Exclude<TourPlacement, "auto" | "center">,
  rect: TourRect,
  size: Size,
  viewport: Viewport,
): CoachPosition {
  const maxLeft = viewport.width - size.width - VIEWPORT_MARGIN;
  const maxTop = viewport.height - size.height - VIEWPORT_MARGIN;
  const alignedLeft = clamp(
    rect.left + rect.width / 2 - size.width / 2,
    VIEWPORT_MARGIN,
    maxLeft,
  );
  const alignedTop = clamp(
    rect.top + rect.height / 2 - size.height / 2,
    VIEWPORT_MARGIN,
    maxTop,
  );

  switch (side) {
    case "bottom":
      return { top: Math.round(rect.top + rect.height + COACH_GAP), left: Math.round(alignedLeft), side };
    case "top":
      return { top: Math.round(rect.top - COACH_GAP - size.height), left: Math.round(alignedLeft), side };
    case "right":
      return { top: Math.round(alignedTop), left: Math.round(rect.left + rect.width + COACH_GAP), side };
    case "left":
      return { top: Math.round(alignedTop), left: Math.round(rect.left - COACH_GAP - size.width), side };
  }
}

/**
 * Place la pancarte.
 * - pas de cible (`rect === null`) ou `placement: "center"` → centrée ;
 * - côté explicite qui tient → respecté ;
 * - sinon on essaie bottom → top → right → left ;
 * - aucun côté ne tient (petit écran, cible plein écran) → centrée.
 * Ne renvoie JAMAIS de coordonnées hors viewport.
 */
export function computeCoachPosition(
  rect: TourRect | null,
  size: Size,
  viewport: Viewport,
  placement: TourPlacement = "auto",
): CoachPosition {
  if (!rect || placement === "center") return centerPosition(size, viewport);

  const candidates: readonly Exclude<TourPlacement, "auto" | "center">[] =
    placement === "auto" ? AUTO_ORDER : [placement, ...AUTO_ORDER.filter((s) => s !== placement)];

  for (const side of candidates) {
    if (fitsOn(side, rect, size, viewport)) return placeOn(side, rect, size, viewport);
  }
  return centerPosition(size, viewport);
}

/** La cible est-elle entièrement visible dans le viewport ? (sinon : scroll). */
export function isRectVisible(rect: TourRect, viewport: Viewport): boolean {
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.top + rect.height <= viewport.height &&
    rect.left + rect.width <= viewport.width
  );
}
