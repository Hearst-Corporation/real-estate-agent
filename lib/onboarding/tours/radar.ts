/**
 * Visite « radar » v1 (REA-ONBOARDING-011, LOT 5J).
 *
 * Parcours : baisses de prix → annonces dormantes → mandats expirants.
 * Chaque étape dit COMMENT ouvrir ensuite la vraie annonce ou le vrai mandat
 * (« Voir l'annonce » vers la source, « Ouvrir » vers les mandats).
 *
 * DOCTRINE — la visite MONTRE, elle n'EXÉCUTE JAMAIS : `/radar` est une
 * surface en lecture seule (GET /api/radar + liens sortants), aucune étape ne
 * déclenche de rafraîchissement ni n'ouvre de lien à la place de l'agent.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../tours";
import type { TourDefinition } from "../types";

const t = UI.onboarding.tours.radar;

/** Ancres `data-tour-id` posées sur les vraies sections de `/radar`. */
export const RADAR_ANCHORS = {
  /** Section « Baisses de prix » (PriceDropList). */
  priceDrops: "radar-price-drops",
  /** Section « Annonces dormantes » (DormantList). */
  dormant: "radar-dormant",
  /** Section « Mandats expirants » (MandateList). */
  mandates: "radar-mandates",
} as const;

export const radarTour: TourDefinition = defineTour({
  key: "radar",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: "/radar",
  steps: [
    {
      id: "baisses",
      anchor: RADAR_ANCHORS.priceDrops,
      route: "/radar",
      title: t.steps.baisses.title,
      body: t.steps.baisses.body,
      consequence: t.steps.baisses.consequence,
      placement: "auto",
      // Les sections n'apparaissent qu'une fois GET /api/radar résolu.
      onMissing: "center",
      waitMs: 6000,
    },
    {
      id: "dormantes",
      anchor: RADAR_ANCHORS.dormant,
      route: "/radar",
      title: t.steps.dormantes.title,
      body: t.steps.dormantes.body,
      consequence: t.steps.dormantes.consequence,
      placement: "auto",
      onMissing: "center",
      waitMs: 6000,
    },
    {
      id: "mandats",
      anchor: RADAR_ANCHORS.mandates,
      route: "/radar",
      title: t.steps.mandats.title,
      body: t.steps.mandats.body,
      consequence: t.steps.mandats.consequence,
      placement: "auto",
      onMissing: "center",
      waitMs: 6000,
    },
  ],
});
