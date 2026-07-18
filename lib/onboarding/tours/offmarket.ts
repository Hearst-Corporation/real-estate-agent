/**
 * Visite « offmarket » v1 (REA-ONBOARDING-011, LOT 5F).
 *
 * Parcours sur `OffmarketExplorer` : choisir un bien réel → cocher les biens à
 * inclure → consulter les acquéreurs correspondants → comprendre le score et
 * ses raisons → créer un lien partageable avec feedback.
 *
 * DOCTRINE — la visite MONTRE, elle n'EXÉCUTE JAMAIS.
 * L'étape « lien partageable » EXPLIQUE le geste, elle ne le déclenche pas :
 * `OffmarketExplorer` teste `tourActive` et refuse `POST /api/offmarket` tant
 * que la visite est ouverte. Aucun lien public n'est créé pendant la visite
 * (LOT 10).
 *
 * Le score et la recommandation affichés viennent du moteur de matching de la
 * prospection (`GET /api/offmarket`) : la visite les commente, elle n'en
 * recalcule aucun.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../define";
import type { TourDefinition } from "../types";

const t = UI.onboarding.tours.offmarket;

/** Ancres `data-tour-id` posées sur les vrais composants d'`OffmarketExplorer`. */
export const OFFMARKET_ANCHORS = {
  /** Liste des biens du portefeuille : bouton de sélection + case à cocher. */
  properties: "offmarket-properties",
  /** Liste des acquéreurs matchés : score, raisons, bouton « Cibler ». */
  matches: "offmarket-matches",
  /** Bloc « Sélection partageable » : bouton de génération du lien public. */
  selection: "offmarket-selection",
} as const;

export const offmarketTour: TourDefinition = defineTour({
  key: "offmarket",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: "/offmarket",
  steps: [
    {
      id: "bien",
      anchor: OFFMARKET_ANCHORS.properties,
      route: "/offmarket",
      title: t.steps.bien.title,
      body: t.steps.bien.body,
      placement: "right",
      // Portefeuille vide → pas de liste : l'explication reste valable.
      onMissing: "center",
    },
    {
      id: "inclure",
      // Les cases à cocher vivent dans cette même liste : c'est le composant
      // responsable du choix des biens inclus.
      anchor: OFFMARKET_ANCHORS.properties,
      route: "/offmarket",
      title: t.steps.inclure.title,
      body: t.steps.inclure.body,
      placement: "right",
      onMissing: "center",
    },
    {
      id: "acquereurs",
      anchor: OFFMARKET_ANCHORS.matches,
      route: "/offmarket",
      title: t.steps.acquereurs.title,
      body: t.steps.acquereurs.body,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "score",
      anchor: OFFMARKET_ANCHORS.matches,
      route: "/offmarket",
      title: t.steps.score.title,
      body: t.steps.score.body,
      consequence: t.steps.score.consequence,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "lien",
      // Le bloc n'existe qu'une fois un acquéreur ciblé : la visite ne cible
      // personne à la place de l'agent, donc l'explication tombe au centre.
      anchor: OFFMARKET_ANCHORS.selection,
      route: "/offmarket",
      title: t.steps.lien.title,
      body: t.steps.lien.body,
      consequence: t.steps.lien.consequence,
      placement: "auto",
      onMissing: "center",
    },
  ],
});
