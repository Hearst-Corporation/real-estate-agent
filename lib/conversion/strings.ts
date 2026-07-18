// lib/conversion/strings.ts — Libellés du cockpit de conversion (fr).
//
// Isolé ici pour ne pas éditer le fichier PARTAGÉ lib/ui-strings.ts. L'intégrateur
// peut fusionner ce bloc dans UI.conversion au reseed baseline final (diff souhaité
// décrit dans le rapport).

import type { PeriodGrain, SegmentKind, StageId } from "./types";

export const CONVERSION_UI = {
  navLabel: "Conversion",
  title: "Cockpit de conversion",
  subtitle: "Pipeline commercial réel : prospect → qualification → engagement → proposition → décision.",
  empty: "Aucun prospect sur cette période. Le funnel s'alimente dès la création de leads.",
  unavailable: "Données indisponibles pour le moment.",
  loading: "Chargement du pipeline…",
  segment: "Type de prospect",
  period: "Période",
  winRate: "Taux de conversion",
  lossRate: "Taux de perte",
  totalLeads: "Prospects entrés",
  funnelTitle: "Entonnoir de conversion",
  delaysTitle: "Délais médians",
  lossesTitle: "Pertes par étage",
  stepRate: "vs étage précédent",
  cumulativeRate: "depuis le sommet",
  sample: (n: number) => `sur ${n} dossier${n > 1 ? "s" : ""}`,
  noDelay: "Pas assez de données",
  openList: "Voir les dossiers",
  days: (n: number) => `${n} j`,
} as const;

export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  all: "Tous",
  acheteur: "Acquéreurs",
  vendeur: "Vendeurs",
};

export const GRAIN_LABELS: Record<PeriodGrain, string> = {
  month: "Mensuel",
  quarter: "Trimestriel",
};

export const STAGE_LABELS: Record<StageId, string> = {
  prospect: "Prospect",
  qualified: "Qualifié",
  engaged: "Engagé (visite / estimation)",
  proposal: "Proposition (offre / mandat)",
  won: "Gagné",
};

export const DELAY_LABELS: Record<string, string> = {
  "nouveau→engage": "Entrée → engagement",
  "engage→gagne": "Engagement → gain",
};

export function delayLabel(fromStatus: string, toStatus: string): string {
  return DELAY_LABELS[`${fromStatus}→${toStatus}`] ?? `${fromStatus} → ${toStatus}`;
}

/** Formate un ratio 0..1 en pourcentage entier. */
export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
