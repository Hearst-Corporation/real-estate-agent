/**
 * Visite « prospection » v1 (REA-ONBOARDING-011, LOT 5B).
 *
 * Parcours : onglets → critères acquéreur → annonces → matching expliqué →
 * feedback et alertes.
 *
 * DOCTRINE — la visite MONTRE, elle n'EXÉCUTE JAMAIS :
 *   aucune étape ne modifie un critère, ne relance une collecte, n'envoie un
 *   signal de feedback ni ne crée une alerte. Les composants qui écrivent
 *   (`CritereForm`, les pouces de la liste de matchs) testent `tourActive` et
 *   refusent toute activation pendant la visite (LOT 10).
 *
 * Les scores montrés viennent du moteur réel (`lib/prospection`) et les
 * critères satisfaits / tolérés / bloquants de `lib/learning` : la visite les
 * commente, elle n'en fabrique aucun.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../define";
import type { TourDefinition } from "../types";

const t = UI.onboarding.tours.prospection;

/** Ancres `data-tour-id` posées sur les vrais composants de `/prospection`. */
export const PROSPECTION_ANCHORS = {
  /** Le contrôle segmenté qui change d'onglet (page.tsx, <nav>). */
  tabs: "prospection-tabs",
  /** La liste des profils de recherche acquéreur (AcquereurProfiles). */
  criteria: "prospection-criteria",
  /** La liste des rapprochements — score, raisons et pouces (MatchList). */
  matching: "prospection-matching",
} as const;

export const prospectionTour: TourDefinition = defineTour({
  key: "prospection",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: "/prospection",
  steps: [
    {
      id: "onglets",
      anchor: PROSPECTION_ANCHORS.tabs,
      route: "/prospection",
      title: t.steps.onglets.title,
      body: t.steps.onglets.body,
      placement: "bottom",
    },
    {
      id: "criteres",
      anchor: PROSPECTION_ANCHORS.criteria,
      route: "/prospection",
      title: t.steps.criteres.title,
      body: t.steps.criteres.body,
      consequence: t.steps.criteres.consequence,
      placement: "auto",
      // Onglet « Acquéreurs » actif par défaut ; si l'agent est ailleurs ou si
      // la base est vide, l'explication reste lisible au centre.
      onMissing: "center",
    },
    {
      id: "annonces",
      // L'onglet « Annonces » est le vrai contrôle qui ouvre cette liste : on
      // le montre plutôt que d'ancrer une liste absente de l'écran courant.
      anchor: PROSPECTION_ANCHORS.tabs,
      route: "/prospection",
      title: t.steps.annonces.title,
      body: t.steps.annonces.body,
      placement: "bottom",
    },
    {
      id: "matching",
      anchor: PROSPECTION_ANCHORS.matching,
      route: "/prospection",
      title: t.steps.matching.title,
      body: t.steps.matching.body,
      consequence: t.steps.matching.consequence,
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "feedback",
      // Les pouces et le score vivent dans la même liste : c'est le composant
      // responsable de l'action commentée.
      anchor: PROSPECTION_ANCHORS.matching,
      route: "/prospection",
      title: t.steps.feedback.title,
      body: t.steps.feedback.body,
      consequence: t.steps.feedback.consequence,
      placement: "auto",
      onMissing: "center",
    },
  ],
});
