import { describe, expect, it } from "vitest";
import {
  centerPosition,
  clamp,
  COACH_GAP,
  computeCoachPosition,
  inflateRect,
  isRectVisible,
  VIEWPORT_MARGIN,
} from "@/lib/onboarding/position";
import type { TourRect } from "@/lib/onboarding/types";

const VIEWPORT = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };
const COACH = { width: 320, height: 200 };

const target: TourRect = { top: 300, left: 600, width: 200, height: 60 };

describe("géométrie de base", () => {
  it("borne une valeur", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(10); // fenêtre impossible → min
  });

  it("élargit un rectangle symétriquement", () => {
    expect(inflateRect(target, 8)).toEqual({ top: 292, left: 592, width: 216, height: 76 });
  });

  it("détecte une cible hors viewport (déclencheur de scroll)", () => {
    expect(isRectVisible(target, VIEWPORT)).toBe(true);
    expect(isRectVisible({ ...target, top: -50 }, VIEWPORT)).toBe(false);
    expect(isRectVisible({ ...target, top: 880 }, VIEWPORT)).toBe(false);
  });
});

describe("placement de la pancarte", () => {
  it("sans cible, la pancarte est centrée", () => {
    const p = computeCoachPosition(null, COACH, VIEWPORT);
    expect(p.side).toBe("center");
    expect(p).toEqual(centerPosition(COACH, VIEWPORT));
  });

  it("placement center explicite ignore la cible", () => {
    expect(computeCoachPosition(target, COACH, VIEWPORT, "center").side).toBe("center");
  });

  it("en auto, essaie le dessous en premier quand il y a la place", () => {
    const p = computeCoachPosition(target, COACH, VIEWPORT, "auto");
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(target.top + target.height + COACH_GAP);
  });

  it("bascule au-dessus quand le dessous ne tient pas", () => {
    const low: TourRect = { top: 800, left: 600, width: 200, height: 60 };
    const p = computeCoachPosition(low, COACH, VIEWPORT, "auto");
    expect(p.side).toBe("top");
    expect(p.top).toBe(low.top - COACH_GAP - COACH.height);
  });

  it("respecte un côté explicite qui tient", () => {
    expect(computeCoachPosition(target, COACH, VIEWPORT, "right").side).toBe("right");
    expect(computeCoachPosition(target, COACH, VIEWPORT, "left").side).toBe("left");
  });

  it("remplace un côté explicite qui ne tient pas", () => {
    const glued: TourRect = { top: 300, left: 0, width: 40, height: 60 };
    const p = computeCoachPosition(glued, COACH, VIEWPORT, "left");
    expect(p.side).not.toBe("left");
    expect(p.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it("retombe au centre quand aucun côté ne tient", () => {
    const huge: TourRect = { top: 0, left: 0, width: MOBILE.width, height: MOBILE.height };
    expect(computeCoachPosition(huge, COACH, MOBILE, "auto").side).toBe("center");
  });

  it("ne sort jamais du viewport, même sur mobile avec cible en coin", () => {
    const corner: TourRect = { top: 20, left: 340, width: 30, height: 30 };
    const p = computeCoachPosition(corner, { width: 320, height: 180 }, MOBILE, "auto");
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left + 320).toBeLessThanOrEqual(MOBILE.width + VIEWPORT_MARGIN);
  });

  it("recalcule différemment après un changement d'orientation", () => {
    const portrait = computeCoachPosition(target, COACH, { width: 812, height: 375 }, "auto");
    const paysage = computeCoachPosition(target, COACH, { width: 375, height: 812 }, "auto");
    expect(portrait).not.toEqual(paysage);
  });
});
