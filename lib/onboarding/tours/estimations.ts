/**
 * Visite « Estimer un bien » — estimations v1 (REA-ONBOARDING-011, LOT 5E).
 * =================================================================
 *
 * Quatre étapes sur `/estimations` : lancer une estimation, lire l'avancement
 * du parc d'estimations, reprendre une estimation interrompue, comprendre ce
 * que produit une estimation terminée (valeur, fourchette, comparables, et la
 * continuité vers propriétaire + mandat).
 *
 * LOT 10 — la visite n'ouvre AUCUN entretien et n'envoie AUCUNE estimation :
 * l'étape « lancer » met en évidence le bouton, elle ne le clique pas.
 *
 * L'étape finale n'a volontairement PAS d'ancre : le résultat vit sur
 * `/estimations/<id>`, une route dépendante d'une donnée réelle que la visite
 * refuse de fabriquer. Elle est donc affichée au centre, en pure explication.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../define";

const t = UI.onboarding.tours.estimations;

/** Ancres `data-tour-id` posées dans `app/(dashboard)/estimations/page.tsx`. */
export const ESTIMATION_ANCHORS = {
  /** Bouton d'en-tête qui ouvre l'entretien d'estimation. */
  create: "estimation-create",
  /** Bloc de répartition par statut (brouillon → prête). */
  pipeline: "estimation-pipeline",
  /** Tableau des estimations : « Reprendre » sur celles en cours. */
  list: "estimation-list",
} as const;

const ESTIMATIONS_ROUTE = "/estimations";

export const estimationsTour = defineTour({
  key: "estimations",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: ESTIMATIONS_ROUTE,
  steps: [
    {
      id: "create",
      anchor: ESTIMATION_ANCHORS.create,
      route: ESTIMATIONS_ROUTE,
      title: t.steps.create.title,
      body: t.steps.create.body,
      consequence: t.steps.create.consequence,
      placement: "bottom",
    },
    {
      id: "pipeline",
      anchor: ESTIMATION_ANCHORS.pipeline,
      route: ESTIMATIONS_ROUTE,
      title: t.steps.pipeline.title,
      body: t.steps.pipeline.body,
      placement: "auto",
    },
    {
      id: "resume",
      anchor: ESTIMATION_ANCHORS.list,
      route: ESTIMATIONS_ROUTE,
      title: t.steps.resume.title,
      body: t.steps.resume.body,
      placement: "auto",
    },
    {
      // Pas d'ancre : le résultat vit sur une fiche `/estimations/<id>` que la
      // visite ne peut pas garantir (et ne créera pas). Explication centrée.
      id: "result",
      title: t.steps.result.title,
      body: t.steps.result.body,
      consequence: t.steps.result.consequence,
      placement: "center",
    },
  ],
});
