/**
 * Product tour — GARDE-FOU DES GESTES IRRÉVERSIBLES (REA-ONBOARDING-011, LOT 10).
 * =================================================================
 *
 * DOCTRINE : le mode visite MONTRE et EXPLIQUE. Il ne doit JAMAIS envoyer un
 * message, approuver/refuser une action réelle, ni lancer un agent.
 *
 * Le moteur pose déjà deux barrières (overlay qui avale les clics, aucun `.click()`
 * programmatique). Ce module ajoute la TROISIÈME, celle qui vit dans le composant
 * responsable de l'action : chaque handler qui déclenche un effet de bord
 * irréversible commence par
 *
 *     if (blockDuringTour(tourActive, "outbox-send")) return;
 *
 * Le drapeau `tourActive` vient de `useTourActive()` (contexte) — miroir de
 * `data-tour-active` sur `<html>`. Trois barrières indépendantes : un clic
 * accidentel, un raccourci clavier ou un `<form>` soumis pendant la visite ne
 * peuvent produire aucun envoi, aucune décision, aucun run.
 *
 * Module PUR (aucun import React, aucun accès DOM) → testable directement.
 */

/**
 * Gestes à effet de bord irréversible, verrouillés pendant une visite.
 * Un geste ajouté ici DOIT être câblé dans son composant (cf. le test de câblage
 * `lib/onboarding/tour-guard.test.ts`, qui relit les fichiers sources).
 */
export const TOUR_BLOCKED_ACTIONS = [
  /** Outbox — enregistre une modification de brouillon (PATCH). */
  "outbox-edit-save",
  /** Outbox — validation humaine d'un brouillon : draft → approved (PATCH). */
  "outbox-approve",
  /** Outbox — ENVOI RÉEL au fournisseur (POST). Le geste le plus sensible. */
  "outbox-send",
  /** Outbox — annulation d'un brouillon (PATCH). */
  "outbox-cancel",
  /** Approbations — approuver ou refuser une action proposée par un agent (POST). */
  "approvals-decision",
  /** Agents — lancement d'un run sur le runtime Aigent (POST). */
  "agents-run",
  /** Agents — décision humaine (HITL) qui débloque un run en attente (POST). */
  "agents-hitl-decision",
] as const;

export type TourBlockedAction = (typeof TOUR_BLOCKED_ACTIONS)[number];

const BLOCKED = new Set<string>(TOUR_BLOCKED_ACTIONS);

/**
 * Vrai si le geste doit être REFUSÉ parce qu'une visite guidée est en cours.
 *
 * Fail-safe : hors visite, ne bloque jamais (`false`) — le produit fonctionne
 * normalement. Pendant une visite, bloque tout geste répertorié.
 *
 * @param tourActive drapeau du contexte de visite (`useTourActive()`).
 * @param action     geste irréversible tenté.
 */
export function blockDuringTour(tourActive: boolean, action: TourBlockedAction): boolean {
  return tourActive && BLOCKED.has(action);
}

/**
 * Un contrôle déclenchant `action` doit-il être inerte à l'écran ?
 * Sert au `disabled` du bouton : pendant la visite, la cible mise en évidence
 * reste LISIBLE (on l'explique) mais n'est pas activable.
 */
export function disabledDuringTour(tourActive: boolean, action: TourBlockedAction): boolean {
  return blockDuringTour(tourActive, action);
}
