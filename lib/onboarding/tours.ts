/**
 * Product tour — REGISTRE TYPÉ VERSIONNÉ (REA-ONBOARDING-011, LOT 11).
 * =================================================================
 *
 * CONTRAT POUR LES WORKERS DE TOURS
 * ---------------------------------------------------------------
 * 1. Crée `lib/onboarding/tours/<ta-clé>.ts` et exporte ta définition :
 *
 *      import { defineTour } from "../tours";
 *      import { UI } from "@/lib/ui-strings";
 *      const t = UI.onboarding.tours.prospection;   // TES textes, ajoutés par toi
 *
 *      export const prospectionTour = defineTour({
 *        key: "prospection",
 *        version: 1,
 *        title: t.title,
 *        description: t.description,
 *        entryRoute: "/prospection",
 *        steps: [
 *          {
 *            id: "criteres",
 *            anchor: "prospection-criteres",   // = data-tour-id sur le VRAI composant
 *            route: "/prospection",
 *            title: t.steps.criteres.title,
 *            body: t.steps.criteres.body,
 *            consequence: t.steps.criteres.consequence,
 *            placement: "auto",     // défaut
 *            onMissing: "center",   // défaut ; "skip" pour sauter si absent
 *            waitMs: 4000,          // défaut (élément chargé en asynchrone)
 *          },
 *        ],
 *      });
 *
 * 2. Branche-la dans TOUR_REGISTRY ci-dessous (remplace `null` par ton import).
 * 3. Tes textes vont dans `UI.onboarding.tours.<ta-clé>` (lib/ui-strings.ts).
 *
 * RÈGLES NON NÉGOCIABLES
 *   - Ancrage par `data-tour-id` UNIQUEMENT (jamais de classe CSS ni nth-child),
 *     posé sur le composant RESPONSABLE de l'action, pas sur un wrapper.
 *   - Une étape MONTRE et EXPLIQUE. Elle ne déclenche rien : le moteur ne clique
 *     pas la cible et ne mute aucune donnée métier (LOT 10).
 *   - Bumper `version` invalide les reprises stockées → la visite repart à 1.
 */

import { UI } from "@/lib/ui-strings";
import { validateTour } from "./progress";
import type { TourDefinition, TourKey, TourRegistry } from "./types";
import { prospectionTour } from "./tours/prospection";
import { radarTour } from "./tours/radar";
import { offmarketTour } from "./tours/offmarket";

/**
 * Fabrique une définition de tour et vérifie sa cohérence (ids uniques, textes
 * présents, version >= 1). En développement, une définition invalide jette tout
 * de suite plutôt que de casser silencieusement l'affichage en production.
 */
export function defineTour(def: TourDefinition): TourDefinition {
  const problems = validateTour(def);
  if (problems.length > 0 && process.env.NODE_ENV !== "production") {
    throw new Error(`Tour « ${def.key} » invalide :\n  - ${problems.join("\n  - ")}`);
  }
  return def;
}

/* ------------------------------------------------------------------ */
/* core-cockpit v1 — la visite socle                                    */
/* ------------------------------------------------------------------ */

const core = UI.onboarding.tours["core-cockpit"];

/**
 * Ancres attendues sur le shell (`data-tour-id="…"`). Tant qu'elles ne sont pas
 * posées, l'étape s'affiche au centre avec son explication : jamais de blocage.
 */
export const CORE_ANCHORS = {
  nav: "cockpit-nav",
  actionCenter: "cockpit-action-center",
  assistant: "cockpit-assistant",
  profile: "cockpit-profile",
} as const;

export const coreCockpitTour: TourDefinition = defineTour({
  key: "core-cockpit",
  version: 1,
  title: core.title,
  description: core.description,
  entryRoute: "/",
  steps: [
    {
      id: "welcome",
      title: core.steps.welcome.title,
      body: core.steps.welcome.body,
      consequence: core.steps.welcome.consequence,
      placement: "center",
    },
    {
      id: "nav",
      anchor: CORE_ANCHORS.nav,
      route: "/",
      title: core.steps.nav.title,
      body: core.steps.nav.body,
      placement: "right",
    },
    {
      id: "actionCenter",
      anchor: CORE_ANCHORS.actionCenter,
      route: "/",
      title: core.steps.actionCenter.title,
      body: core.steps.actionCenter.body,
      placement: "auto",
    },
    {
      id: "assistant",
      anchor: CORE_ANCHORS.assistant,
      title: core.steps.assistant.title,
      body: core.steps.assistant.body,
      consequence: core.steps.assistant.consequence,
      placement: "left",
    },
    {
      id: "profile",
      anchor: CORE_ANCHORS.profile,
      title: core.steps.profile.title,
      body: core.steps.profile.body,
      placement: "auto",
    },
    {
      id: "wrapup",
      title: core.steps.wrapup.title,
      body: core.steps.wrapup.body,
      placement: "center",
    },
  ],
});

/* ------------------------------------------------------------------ */
/* Registre — un slot par clé du LOT 11                                 */
/* ------------------------------------------------------------------ */

/**
 * `null` = tour pas encore livré par son worker. Le moteur ignore les slots
 * vides : aucun lanceur cassé, aucune visite fantôme.
 */
export const TOUR_REGISTRY: TourRegistry = {
  "core-cockpit": coreCockpitTour,
  prospection: prospectionTour, // W4 → lib/onboarding/tours/prospection.ts
  crm: null, // W3
  estimations: null, // W3
  offmarket: offmarketTour, // W4 → lib/onboarding/tours/offmarket.ts
  "communications-hitl": null, // W5
  agents: null, // W5
  radar: radarTour, // W4 → lib/onboarding/tours/radar.ts
};

/** Définition d'une visite, ou `null` si le slot n'est pas encore rempli. */
export function getTour(key: TourKey): TourDefinition | null {
  return TOUR_REGISTRY[key] ?? null;
}

/** Visites réellement livrées, dans l'ordre du registre. */
export function listTours(): TourDefinition[] {
  return Object.values(TOUR_REGISTRY).filter((t): t is TourDefinition => t !== null);
}
