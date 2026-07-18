/**
 * Placement responsive de la pancarte — INVARIANT DUR (W7).
 * =================================================================
 *
 * Ce que ces tests PROUVENT, sans navigateur :
 *   1. à 390px (mobile courant) comme à 1440px (desktop), la pancarte ne sort
 *      JAMAIS du viewport, quel que soit le placement demandé, quelle que soit
 *      la position de la cible — même collée à un bord ;
 *   2. `x >= 0` et `x + largeur <= viewport.width` (bord opposé) sur TOUS les
 *      placements + le repli, y compris quand aucun côté ne tient ;
 *   3. cible absente (`rect === null`) → pancarte centrée, jamais hors écran.
 *
 * On balaie exhaustivement des positions de cible (coins, bords, centre) pour
 * chaque placement, à deux largeurs. C'est la garantie anti-débordement que le
 * §DESIGN impose (« JAMAIS de scroll horizontal sur le body »).
 */

import { describe, expect, it } from "vitest";
import {
  centerPosition,
  clampAxis,
  computeCoachPosition,
  VIEWPORT_MARGIN,
} from "@/lib/onboarding/position";
import type { TourPlacement, TourRect } from "@/lib/onboarding/types";

const MOBILE = { width: 390, height: 844 }; // iPhone 14/15 logique
const DESKTOP = { width: 1440, height: 900 };
const COACH = { width: 320, height: 200 }; // largeur réelle de la pancarte (w-80)

const PLACEMENTS: readonly TourPlacement[] = ["auto", "top", "bottom", "left", "right"];

/** Génère une grille de cibles : chaque coin, chaque bord, le centre. */
function targetGrid(vw: number, vh: number): TourRect[] {
  const w = 120;
  const h = 48;
  const xs = [0, Math.round(vw / 2 - w / 2), vw - w]; // gauche, centre, droite
  const ys = [0, Math.round(vh / 2 - h / 2), vh - h]; // haut, centre, bas
  const rects: TourRect[] = [];
  for (const top of ys) for (const left of xs) rects.push({ top, left, width: w, height: h });
  return rects;
}

/** Invariant dur : la pancarte tient entièrement dans le viewport. */
function assertInViewport(
  p: { top: number; left: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  label: string,
) {
  expect(p.left, `${label} — left >= 0`).toBeGreaterThanOrEqual(0);
  expect(p.top, `${label} — top >= 0`).toBeGreaterThanOrEqual(0);
  expect(p.left + size.width, `${label} — bord droit dans le viewport`).toBeLessThanOrEqual(
    viewport.width,
  );
  expect(p.top + size.height, `${label} — bord bas dans le viewport`).toBeLessThanOrEqual(
    viewport.height,
  );
}

describe("clampAxis — la brique anti-débordement", () => {
  it("garde la coordonnée dans [0, viewport - extent] pour une pancarte qui tient", () => {
    // Trop à droite → ramenée pour que le bord opposé reste visible.
    expect(clampAxis(9999, 320, 390) + 320).toBeLessThanOrEqual(390);
    // Trop à gauche → jamais négative.
    expect(clampAxis(-9999, 320, 390)).toBeGreaterThanOrEqual(0);
    // Déjà bien placée → conservée (au bornage/arrondi près).
    expect(clampAxis(30, 320, 390)).toBeGreaterThanOrEqual(0);
    expect(clampAxis(30, 320, 390) + 320).toBeLessThanOrEqual(390);
  });

  it("épingle à 0 une pancarte plus large que le viewport (cas dégénéré)", () => {
    expect(clampAxis(100, 500, 390)).toBe(0);
    expect(clampAxis(-100, 500, 390)).toBe(0);
  });

  it("réduit la marge sur un viewport très étroit, sans jamais dépasser", () => {
    // extent = 300, viewport = 320 → slack = 20, marge idéale 16 > 10 → ramenée à 10.
    const c = clampAxis(9999, 300, 320);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c + 300).toBeLessThanOrEqual(320);
  });
});

describe("aucun débordement à 390px, tous placements × toutes cibles", () => {
  for (const placement of PLACEMENTS) {
    it(`placement "${placement}" reste dans le viewport 390px`, () => {
      for (const rect of targetGrid(MOBILE.width, MOBILE.height)) {
        const p = computeCoachPosition(rect, COACH, MOBILE, placement);
        assertInViewport(p, COACH, MOBILE, `390/${placement}/${rect.top},${rect.left}`);
      }
    });
  }
});

describe("aucun débordement à 1440px, tous placements × toutes cibles", () => {
  for (const placement of PLACEMENTS) {
    it(`placement "${placement}" reste dans le viewport 1440px`, () => {
      for (const rect of targetGrid(DESKTOP.width, DESKTOP.height)) {
        const p = computeCoachPosition(rect, COACH, DESKTOP, placement);
        assertInViewport(p, COACH, DESKTOP, `1440/${placement}/${rect.top},${rect.left}`);
      }
    });
  }
});

describe("repli quand la cible ne laisse de place ni à droite ni en bas", () => {
  it("cible collée au coin bas-droit à 390px → pancarte replacée, jamais hors écran", () => {
    // Cible en bas à droite : ni « bottom » ni « right » ne tiennent.
    const glued: TourRect = { top: MOBILE.height - 60, left: MOBILE.width - 60, width: 60, height: 60 };
    const p = computeCoachPosition(glued, COACH, MOBILE, "auto");
    assertInViewport(p, COACH, MOBILE, "coin bas-droit");
    // Le moteur a basculé sur un côté qui tient (haut/gauche) ou centré.
    expect(["top", "left", "center"]).toContain(p.side);
  });

  it("cible plein écran à 390px (aucun côté ne tient) → centrée, dans le viewport", () => {
    const full: TourRect = { top: 0, left: 0, width: MOBILE.width, height: MOBILE.height };
    const p = computeCoachPosition(full, COACH, MOBILE, "auto");
    expect(p.side).toBe("center");
    assertInViewport(p, COACH, MOBILE, "plein écran → centre");
  });

  it("un côté explicite qui ne tient pas est remplacé, sans débordement", () => {
    // On force « right » alors que la cible touche le bord droit : impossible.
    const rightGlued: TourRect = { top: 300, left: MOBILE.width - 30, width: 30, height: 40 };
    const p = computeCoachPosition(rightGlued, COACH, MOBILE, "right");
    expect(p.side).not.toBe("right");
    assertInViewport(p, COACH, MOBILE, "right impossible → repli");
  });
});

describe("cible absente → repli centré", () => {
  it("rect null → pancarte centrée, jamais hors viewport (mobile et desktop)", () => {
    const m = computeCoachPosition(null, COACH, MOBILE, "auto");
    expect(m.side).toBe("center");
    expect(m).toEqual(centerPosition(COACH, MOBILE));
    assertInViewport(m, COACH, MOBILE, "null → centre mobile");

    const d = computeCoachPosition(null, COACH, DESKTOP, "auto");
    expect(d.side).toBe("center");
    assertInViewport(d, COACH, DESKTOP, "null → centre desktop");
  });

  it("centrage : la marge minimale est respectée dès que la place existe", () => {
    const p = centerPosition(COACH, MOBILE);
    expect(p.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });
});
