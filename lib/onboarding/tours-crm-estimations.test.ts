/**
 * Tours CRM + estimations + volet Accueil du tour socle (REA-ONBOARDING-011, W3).
 *
 * Ce test protège les DEUX propriétés qui font échouer une visite en silence :
 *   1. la structure (tour livré, étapes attendues, ancres réellement posées) ;
 *   2. le LOT 10 — une visite MONTRE, elle n'exécute rien : aucune étape ne
 *      porte de route mutante, et les étapes qui pointent une action de
 *      création disent explicitement que rien n'est enregistré sans validation.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTour, DASHBOARD_ANCHORS } from "./tours";
import { crmTour, CRM_ANCHORS } from "./tours/crm";
import { estimationsTour, ESTIMATION_ANCHORS } from "./tours/estimations";
import { validateTour } from "./progress";
import type { TourDefinition } from "./types";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Fichiers où les ancres de W3 doivent être posées. */
const ANCHOR_SOURCES = [
  "app/(dashboard)/page.tsx",
  "app/(dashboard)/leads/page.tsx",
  "app/(dashboard)/leads/_components/LeadForm.tsx",
  "app/(dashboard)/leads/_components/LeadsCockpit.tsx",
  "app/(dashboard)/properties/_components/PropertyForm.tsx",
  "app/(dashboard)/properties/_components/PropertiesCockpit.tsx",
  "app/(dashboard)/properties/_components/PropertiesViewToggle.tsx",
  "app/(dashboard)/estimations/page.tsx",
  "components/cockpit/ActionCenter.tsx",
  "components/cockpit/RailLeft.tsx",
  "components/cockpit/RailRight.tsx",
  "components/cockpit/PageNavTabs.tsx",
] as const;

const SOURCES = ANCHOR_SOURCES.map(read).join("\n");

/**
 * Une ancre est « posée » si une constante d'ancre alimente un `data-tour-id` —
 * soit directement, soit via le `tourId` d'un composant local qui le rend
 * lui-même (cf. `Panel` dans LeadsCockpit).
 */
function anchorIsPosed(anchorKey: string): boolean {
  return new RegExp(`(?:data-tour-id|tourId)=\\{[^}]*\\.${anchorKey}\\b`).test(SOURCES);
}

describe("tour crm", () => {
  it("est livré dans le registre, en v1, avec ses 8 étapes", () => {
    const tour = getTour("crm");
    expect(tour).toBe(crmTour);
    expect(crmTour.version).toBe(1);
    expect(crmTour.steps).toHaveLength(8);
    expect(validateTour(crmTour)).toEqual([]);
  });

  it("couvre clients puis portefeuille, chaque étape sur sa route", () => {
    const routes = crmTour.steps.map((s) => s.route);
    expect(routes.slice(0, 4)).toEqual(Array(4).fill("/leads"));
    expect(routes.slice(4)).toEqual(Array(4).fill("/properties"));
    expect(crmTour.entryRoute).toBe("/leads");
  });

  it("pointe des ancres réellement posées dans le produit", () => {
    const declared = Object.values(CRM_ANCHORS) as string[];
    for (const step of crmTour.steps) {
      expect(step.anchor, `étape ${step.id} sans ancre`).toBeTruthy();
      expect(declared, `étape ${step.id} hors CRM_ANCHORS`).toContain(step.anchor);
    }
    for (const key of Object.keys(CRM_ANCHORS)) {
      expect(anchorIsPosed(key), `ancre ${key} jamais posée`).toBe(true);
    }
  });

  it("annonce que la création dépend d'une validation de l'utilisateur", () => {
    for (const id of ["leadCreate", "propertyCreate"]) {
      const step = crmTour.steps.find((s) => s.id === id);
      expect(step?.consequence).toMatch(/validation/i);
    }
  });
});

describe("tour estimations", () => {
  it("est livré dans le registre, en v1, avec ses 4 étapes", () => {
    expect(getTour("estimations")).toBe(estimationsTour);
    expect(estimationsTour.version).toBe(1);
    expect(estimationsTour.steps).toHaveLength(4);
    expect(validateTour(estimationsTour)).toEqual([]);
  });

  it("pointe des ancres posées ; l'étape « résultat » reste explicative", () => {
    for (const key of Object.keys(ESTIMATION_ANCHORS)) {
      expect(anchorIsPosed(key), `ancre ${key} jamais posée`).toBe(true);
    }
    const result = estimationsTour.steps.at(-1);
    expect(result?.id).toBe("result");
    // Le résultat vit sur /estimations/<id> : pas d'ancre, donc pas de route
    // dépendante d'une donnée que la visite refuse de fabriquer.
    expect(result?.anchor).toBeUndefined();
    expect(result?.route).toBeUndefined();
    expect(result?.placement).toBe("center");
  });
});

describe("tour core-cockpit — volet Accueil (LOT 5A)", () => {
  const core = getTour("core-cockpit") as TourDefinition;

  it("ajoute les 4 étapes d'accueil, ancrées sur la page d'accueil", () => {
    const ids = core.steps.map((s) => s.id);
    for (const id of [
      "dashboardNewEstimation",
      "dashboardKpis",
      "dashboardActionCenter",
      "dashboardRecentProperties",
    ]) {
      expect(ids).toContain(id);
      const step = core.steps.find((s) => s.id === id);
      expect(step?.route).toBe("/");
      expect(step?.anchor).toBeTruthy();
    }
    for (const key of Object.keys(DASHBOARD_ANCHORS)) {
      expect(anchorIsPosed(key), `ancre ${key} jamais posée`).toBe(true);
    }
  });

  it("garde les ancres d'accueil distinctes de celles du chrome", () => {
    const values = Object.values(DASHBOARD_ANCHORS);
    expect(new Set(values).size).toBe(values.length);
    expect(values).not.toContain("cockpit-action-center");
  });
});

describe("LOT 10 — les visites de W3 n'exécutent rien", () => {
  const tours = [crmTour, estimationsTour, getTour("core-cockpit") as TourDefinition];

  it("ne déclare que des routes de LECTURE (aucune route de création)", () => {
    for (const tour of tours) {
      for (const step of tour.steps) {
        if (!step.route) continue;
        expect(step.route, `${tour.key}/${step.id}`).not.toMatch(/\/new$|[?&]new=/);
      }
    }
  });

  it("n'expose aucun mécanisme d'activation dans les définitions", () => {
    const files = [
      read("lib/onboarding/tours/crm.ts"),
      read("lib/onboarding/tours/estimations.ts"),
    ].join("\n");
    expect(files).not.toMatch(/\.click\(|\.submit\(|fetch\(/);
  });

  it("donne à chaque étape un titre et une explication non vides", () => {
    for (const tour of tours) {
      for (const step of tour.steps) {
        expect(step.title.trim().length, `${tour.key}/${step.id}`).toBeGreaterThan(0);
        expect(step.body.trim().length, `${tour.key}/${step.id}`).toBeGreaterThan(0);
      }
    }
  });
});
