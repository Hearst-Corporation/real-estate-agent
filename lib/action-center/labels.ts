/**
 * lib/action-center/labels.ts — libellés PROPRES à la page « Centre d'actions »
 * (W1). Centralisés ici (ownership W1) plutôt qu'en dur dans les composants, en
 * attendant le reseed baseline de `lib/ui-strings.ts` par l'intégrateur (diff
 * souhaité décrit dans le rapport). Aucun texte visible en dur dans les .tsx.
 *
 * Réutilise `UI.dashboard.center.*` pour tout ce qui existe déjà ; n'ajoute QUE
 * le vocabulaire nouveau (facteurs de score, signaux radar, page dédiée).
 */

import type { ScoreFactor } from "@/lib/action-center/types";
import type { RadarLabels, ApprovalLabels } from "@/lib/action-center/aggregate";

/** Libellés courts et lisibles des facteurs de score (le « pourquoi si haut »). */
export const FACTOR_LABEL: Record<ScoreFactor, string> = {
  base: "Importance de la catégorie",
  priority: "Priorité élevée",
  overdue: "En retard",
  dueSoon: "Échéance imminente",
  signalStrength: "Signal marché fort",
};

/** Textes de la page dédiée (eyebrow, titre, sous-titres, états). */
export const AC = {
  eyebrow: "Cockpit",
  title: "Centre d'actions",
  subtitle: (n: number) =>
    n === 0
      ? "Rien à traiter — tout est à jour."
      : `${n} action${n > 1 ? "s" : ""} priorisée${n > 1 ? "s" : ""} par score, la plus urgente en premier.`,
  empty: "Rien à traiter pour l'instant.",
  emptyHint: "Les relances, RDV, approbations et opportunités marché apparaîtront ici.",
  scoreLabel: "Score",
  whyLabel: "Pourquoi ce score",
  computedAt: (t: string) => `Calculé à ${t}`,
  sources: {
    core: "Actions CRM",
    radar: "Opportunités marché",
    approvals: "Approbations",
  },
  status: {
    live: "À jour",
    unavailable: "Indisponible",
  },
} as const;

/** Libellés radar injectés dans l'agrégation (aucun texte en dur dans aggregate.ts). */
export const RADAR_LABELS: RadarLabels = {
  priceDrop: (pct, eur) =>
    `Baisse de prix ${pct}% (−${eur.toLocaleString("fr-FR")} €)`,
  dormant: (days) => `Annonce dormante depuis ${days} j`,
  mandateExpiry: (days) =>
    days <= 0 ? "Mandat expiré à relancer" : `Mandat expire dans ${days} j`,
  fallbackAnnonce: "Annonce",
  fallbackMandate: "Mandat",
};

/** Libellés approbations injectés dans l'agrégation. */
export const APPROVAL_LABELS: ApprovalLabels = {
  pending: (channel) =>
    channel ? `Message ${channel} à valider` : "Envoi à valider",
  fallback: "Approbation en attente",
};
