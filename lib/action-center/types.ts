/**
 * lib/action-center/types.ts — modèle du CENTRE D'ACTIONS QUOTIDIEN (W1).
 *
 * Surcouche PRIORISANTE au-dessus du centre d'actions dérivé (`lib/actions`).
 * On ne réécrit pas la dérivation : on prend les `ActionItem` déjà produites par
 * `buildActionCenter`, on y ajoute les OPPORTUNITÉS VENDEURS (radar) et les
 * APPROBATIONS EN ATTENTE (HITL), puis on attribue à CHAQUE carte un SCORE
 * déterministe et EXPLICABLE (poids nommés + contributions lisibles).
 *
 * Aucune donnée fabriquée : chaque carte scorée est adossée à une vraie ligne DB
 * et pointe vers une vraie entité (href réel) avec une prochaine action réelle.
 * Types purs (serveur + client), zéro dépendance React.
 */

import type { ActionItem } from "@/lib/actions/types";

/** Statut de disponibilité d'une source (vérité LIVE / UNAVAILABLE honnête). */
export type SourceStatus = "live" | "unavailable";

/** Une contribution nommée au score — rend le calcul transparent et auditable. */
export type ScoreContribution = {
  /** Clé de libellé (résolue côté UI via UI.actionCenter.factors). */
  factor: ScoreFactor;
  /** Points ajoutés par ce facteur (peut être 0 ; jamais négatif). */
  points: number;
};

/** Facteurs de score — ensemble FINI et nommé (zéro poids anonyme). */
export type ScoreFactor =
  | "base" // poids de base de la catégorie
  | "priority" // remontée de priorité métier (haute/normale/basse)
  | "overdue" // échéance dépassée (plus c'est vieux, plus ça monte, borné)
  | "dueSoon" // échéance proche (aujourd'hui / imminent)
  | "signalStrength"; // force du signal radar (baisse %, ancienneté, expiration)

/**
 * Une carte du centre d'actions quotidien = un ActionItem + son score expliqué.
 * `score` est borné [0..100]. `explanation` liste les contributions (somme = score
 * avant plafond). `scoreReason` est la phrase courte affichable (« pourquoi si haut »).
 */
export type ScoredAction = ActionItem & {
  score: number;
  explanation: ScoreContribution[];
  /** Clé de raison dominante (le facteur qui pèse le plus) — pour un libellé court. */
  topFactor: ScoreFactor;
};

/** Une section du centre quotidien, avec son statut de disponibilité honnête. */
export type ActionSection = {
  status: SourceStatus;
  items: ScoredAction[];
};

/** Réponse agrégée du centre d'actions quotidien (ce que l'API renvoie). */
export type DailyCenterResponse = {
  /** Toutes les cartes scorées, triées par score décroissant (déjà fusionnées). */
  items: ScoredAction[];
  /** Statut par source (pour afficher LIVE / UNAVAILABLE section par section). */
  sources: {
    /** Centre d'actions dérivé (tâches/leads/visites/estim/mandats/matchs). */
    core: SourceStatus;
    /** Opportunités vendeurs (radar : baisses de prix, dormantes, mandats expirants). */
    radar: SourceStatus;
    /** Approbations HITL en attente (table non déployée → unavailable honnête). */
    approvals: SourceStatus;
  };
  /** Nombre total d'items scorés. */
  total: number;
  /** Instant de calcul (ISO) — pour affichage « à jour à HH:MM ». */
  computedAt: string;
};
