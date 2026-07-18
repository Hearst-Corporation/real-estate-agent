import { describe, expect, it } from "vitest";
import {
  clampIndex,
  completeProgress,
  goToProgress,
  isLastStep,
  isStepRenderable,
  missingStrategy,
  nextProgress,
  parseProgress,
  prevProgress,
  resumeProgress,
  seekRenderableStep,
  serializeProgress,
  skipProgress,
  startProgress,
  statusFromStored,
  stepAt,
  stepPosition,
  validateTour,
} from "@/lib/onboarding/progress";
import { coreCockpitTour, getTour, listTours, TOUR_REGISTRY } from "@/lib/onboarding/tours";
import { TOUR_KEYS } from "@/lib/onboarding/types";
import type { TourDefinition, TourProgress, TourStep } from "@/lib/onboarding/types";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

function step(over: Partial<TourStep> & { id: string }): TourStep {
  return { title: "T", body: "B", ...over };
}

function tour(steps: TourStep[], over: Partial<TourDefinition> = {}): TourDefinition {
  return {
    key: "core-cockpit",
    version: 1,
    title: "Visite",
    description: "Desc",
    entryRoute: "/",
    steps,
    ...over,
  };
}

const THREE = tour([step({ id: "a" }), step({ id: "b" }), step({ id: "c" })]);

describe("bornes d'index", () => {
  it("borne un index hors limites", () => {
    expect(clampIndex(THREE, -5)).toBe(0);
    expect(clampIndex(THREE, 99)).toBe(2);
    expect(clampIndex(THREE, 1)).toBe(1);
  });

  it("tolère NaN et les décimales", () => {
    expect(clampIndex(THREE, Number.NaN)).toBe(0);
    expect(clampIndex(THREE, 1.7)).toBe(1);
  });

  it("renvoie 0 sur un tour vide", () => {
    expect(clampIndex(tour([]), 3)).toBe(0);
    expect(stepAt(tour([]), 0)).toBeNull();
  });
});

describe("étape suivante / précédente", () => {
  it("avance d'une étape", () => {
    const p = nextProgress(THREE, startProgress(THREE, NOW), NOW);
    expect(p.stepIndex).toBe(1);
    expect(p.status).toBe("running");
  });

  it("termine la visite sur la dernière étape, sans sortir des bornes", () => {
    const last: TourProgress = { ...startProgress(THREE, NOW), stepIndex: 2 };
    const p = nextProgress(THREE, last, NOW);
    expect(p.stepIndex).toBe(2);
    expect(p.status).toBe("completed");
    expect(isLastStep(THREE, p.stepIndex)).toBe(true);
  });

  it("recule d'une étape et reste sur la première", () => {
    const at1: TourProgress = { ...startProgress(THREE, NOW), stepIndex: 1 };
    expect(prevProgress(THREE, at1, NOW).stepIndex).toBe(0);
    expect(prevProgress(THREE, startProgress(THREE, NOW), NOW).stepIndex).toBe(0);
  });

  it("un retour arrière après complétion repasse en running", () => {
    const done = completeProgress(THREE, { ...startProgress(THREE, NOW), stepIndex: 2 }, NOW);
    expect(prevProgress(THREE, done, NOW).status).toBe("running");
  });

  it("saute à une étape donnée, en bornant", () => {
    expect(goToProgress(THREE, startProgress(THREE, NOW), 42, NOW).stepIndex).toBe(2);
  });

  it("ne mute jamais l'objet d'entrée", () => {
    const p = startProgress(THREE, NOW);
    const snapshot = { ...p };
    nextProgress(THREE, p, NOW);
    prevProgress(THREE, p, NOW);
    skipProgress(p, NOW);
    expect(p).toEqual(snapshot);
  });
});

describe("passage et complétion", () => {
  it("passer la visite marque skipped", () => {
    expect(skipProgress(startProgress(THREE, NOW), NOW).status).toBe("skipped");
  });

  it("terminer marque completed", () => {
    expect(completeProgress(THREE, startProgress(THREE, NOW), NOW).status).toBe("completed");
  });

  it("libellé « Étape X sur Y » en 1-based", () => {
    expect(stepPosition(THREE, 0)).toEqual({ current: 1, total: 3 });
    expect(stepPosition(THREE, 2)).toEqual({ current: 3, total: 3 });
  });
});

describe("cible absente — jamais de blocage", () => {
  const present = new Set(["ok"]);
  const isPresent = (a: string) => present.has(a);

  it("une étape sans ancre est toujours affichable", () => {
    expect(isStepRenderable(step({ id: "x" }), isPresent)).toBe(true);
  });

  it("une ancre absente en stratégie center reste affichable (explication centrée)", () => {
    expect(isStepRenderable(step({ id: "x", anchor: "nope" }), isPresent)).toBe(true);
    expect(missingStrategy(step({ id: "x" }))).toBe("center");
  });

  it("une ancre absente en stratégie skip n'est pas affichable", () => {
    expect(isStepRenderable(step({ id: "x", anchor: "nope", onMissing: "skip" }), isPresent)).toBe(
      false,
    );
  });

  it("saute les étapes skip introuvables et s'arrête sur la première utile", () => {
    const def = tour([
      step({ id: "a", anchor: "nope", onMissing: "skip" }),
      step({ id: "b", anchor: "nope2", onMissing: "skip" }),
      step({ id: "c", anchor: "ok" }),
    ]);
    expect(seekRenderableStep(def, 0, 1, isPresent)).toBe(2);
  });

  it("renvoie null quand plus rien n'est affichable (l'appelant termine la visite)", () => {
    const def = tour([
      step({ id: "a", anchor: "ok" }),
      step({ id: "b", anchor: "nope", onMissing: "skip" }),
    ]);
    expect(seekRenderableStep(def, 1, 1, isPresent)).toBeNull();
  });

  it("cherche aussi en marche arrière", () => {
    const def = tour([
      step({ id: "a", anchor: "ok" }),
      step({ id: "b", anchor: "nope", onMissing: "skip" }),
    ]);
    expect(seekRenderableStep(def, 1, -1, isPresent)).toBe(0);
  });
});

describe("reprise après rechargement", () => {
  it("reprend une visite en cours à l'étape stockée", () => {
    const stored: TourProgress = {
      key: "core-cockpit",
      version: 1,
      stepIndex: 1,
      status: "running",
      updatedAt: 1,
    };
    expect(resumeProgress(THREE, stored, NOW)?.stepIndex).toBe(1);
  });

  it("borne une étape stockée devenue hors limites", () => {
    const stored: TourProgress = {
      key: "core-cockpit",
      version: 1,
      stepIndex: 99,
      status: "running",
      updatedAt: 1,
    };
    expect(resumeProgress(THREE, stored, NOW)?.stepIndex).toBe(2);
  });

  it("ne reprend pas une visite terminée, passée, ou d'une autre version", () => {
    const base: TourProgress = {
      key: "core-cockpit",
      version: 1,
      stepIndex: 1,
      status: "running",
      updatedAt: 1,
    };
    expect(resumeProgress(THREE, { ...base, status: "completed" }, NOW)).toBeNull();
    expect(resumeProgress(THREE, { ...base, status: "skipped" }, NOW)).toBeNull();
    expect(resumeProgress(THREE, { ...base, version: 2 }, NOW)).toBeNull();
    expect(resumeProgress(THREE, { ...base, key: "crm" }, NOW)).toBeNull();
    expect(resumeProgress(THREE, null, NOW)).toBeNull();
  });

  it("une version bumpée remet le statut à idle", () => {
    const stored: TourProgress = {
      key: "core-cockpit",
      version: 1,
      stepIndex: 1,
      status: "completed",
      updatedAt: 1,
    };
    expect(statusFromStored(THREE, stored)).toBe("completed");
    expect(statusFromStored(tour(THREE.steps as TourStep[], { version: 2 }), stored)).toBe("idle");
    expect(statusFromStored(THREE, null)).toBe("idle");
  });

  it("sérialise et relit sans perte", () => {
    const p = startProgress(THREE, NOW);
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it("rejette un stockage corrompu au lieu de planter", () => {
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress("")).toBeNull();
    expect(parseProgress("{pas du json")).toBeNull();
    expect(parseProgress('"chaine"')).toBeNull();
    expect(parseProgress('{"key":"crm"}')).toBeNull();
    expect(parseProgress('{"key":"crm","version":1,"stepIndex":0,"status":"zombie"}')).toBeNull();
  });
});

describe("validation des définitions", () => {
  it("accepte un tour bien formé", () => {
    expect(validateTour(THREE)).toEqual([]);
  });

  it("refuse ids dupliqués, tour vide, version invalide, textes manquants", () => {
    expect(validateTour(tour([step({ id: "a" }), step({ id: "a" })]))).toContain(
      "id d'étape dupliqué : core-cockpit/a",
    );
    expect(validateTour(tour([])).length).toBeGreaterThan(0);
    expect(validateTour(tour([step({ id: "a" })], { version: 0 })).length).toBeGreaterThan(0);
    expect(
      validateTour(tour([{ id: "a", title: "", body: "" }])).some((p) => p.includes("obligatoires")),
    ).toBe(true);
  });
});

describe("registre LOT 11", () => {
  it("expose un slot pour chaque clé connue", () => {
    for (const key of TOUR_KEYS) {
      expect(Object.hasOwn(TOUR_REGISTRY, key)).toBe(true);
    }
  });

  it("core-cockpit est livré, valide et versionné", () => {
    const def = getTour("core-cockpit");
    expect(def).not.toBeNull();
    expect(validateTour(def as TourDefinition)).toEqual([]);
    expect(coreCockpitTour.version).toBe(1);
    expect(coreCockpitTour.steps.length).toBeGreaterThan(0);
  });

  it("n'ancre que via data-tour-id : jamais de sélecteur CSS", () => {
    for (const s of coreCockpitTour.steps) {
      if (!s.anchor) continue;
      expect(s.anchor).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("listTours ignore les slots non livrés", () => {
    expect(listTours().every((t) => t !== null)).toBe(true);
    expect(listTours()).toContain(coreCockpitTour);
    // Indépendant de l'avancement des workers : tout slot encore vide au
    // registre renvoie bien `null`, et seuls les slots remplis sont listés.
    for (const key of TOUR_KEYS) {
      if (TOUR_REGISTRY[key] === null) expect(getTour(key)).toBeNull();
    }
    expect(listTours().length).toBe(
      TOUR_KEYS.filter((k) => TOUR_REGISTRY[k] !== null).length,
    );
  });
});
