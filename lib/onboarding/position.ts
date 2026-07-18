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

/**
 * Borne une coordonnée d'un axe pour que la pancarte reste ENTIÈREMENT dans le
 * viewport, y compris le cas pathologique où la pancarte est plus large/haute
 * que l'espace utile.
 *
 * Garantie dure (le contrat du module) :
 *   - `coord >= 0` toujours ;
 *   - `coord + extent <= viewportExtent` dès que `extent <= viewportExtent`.
 *
 * Quand la pancarte dépasse le viewport (`extent > viewportExtent`, ne survient
 * pas en pratique car la pancarte est bornée par `max-w-[calc(100vw-2rem)]`), on
 * l'épingle à `0` : le coin haut-gauche reste visible plutôt que de laisser
 * fuir le bord opposé hors de l'écran.
 */
export function clampAxis(coord: number, extent: number, viewportExtent: number): number {
  // Pancarte plus grande que l'espace : le coin haut-gauche reste visible.
  if (extent >= viewportExtent) return 0;
  // Espace libre total de part et d'autre de la pancarte.
  const slack = viewportExtent - extent; // > 0 ici
  // Marge idéale de 16px, réduite si le viewport est trop étroit pour la tenir
  // des deux côtés (on garde toujours `lo <= hi`, donc un intervalle valide).
  const margin = Math.min(VIEWPORT_MARGIN, slack / 2);
  const lo = margin; // bord proche : `coord >= margin >= 0`
  const hi = slack - margin; // bord opposé : `coord + extent <= viewportExtent - margin`
  return Math.round(clamp(coord, lo, hi));
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

/**
 * Position centrée à l'écran (repli universel).
 * Le centrage passe par `clampAxis` : même une pancarte plus grande que le
 * viewport ne renvoie jamais de coordonnée hors écran (contrat du module).
 */
export function centerPosition(size: Size, viewport: Viewport): CoachPosition {
  return {
    top: clampAxis((viewport.height - size.height) / 2, size.height, viewport.height),
    left: clampAxis((viewport.width - size.width) / 2, size.width, viewport.width),
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
  // Axe transverse aligné sur le centre de la cible, puis borné pour rester
  // entièrement dans le viewport (clampAxis garantit `>= 0` et `+extent <= vp`).
  const alignedLeft = clampAxis(
    rect.left + rect.width / 2 - size.width / 2,
    size.width,
    viewport.width,
  );
  const alignedTop = clampAxis(
    rect.top + rect.height / 2 - size.height / 2,
    size.height,
    viewport.height,
  );

  switch (side) {
    case "bottom":
      return { top: Math.round(rect.top + rect.height + COACH_GAP), left: alignedLeft, side };
    case "top":
      return { top: Math.round(rect.top - COACH_GAP - size.height), left: alignedLeft, side };
    case "right":
      return { top: alignedTop, left: Math.round(rect.left + rect.width + COACH_GAP), side };
    case "left":
      return { top: alignedTop, left: Math.round(rect.left - COACH_GAP - size.width), side };
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
