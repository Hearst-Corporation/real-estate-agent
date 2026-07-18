"use client";

/**
 * Point de montage UNIQUE de l'onboarding dans le shell authentifié.
 * =================================================================
 *
 * REA-UX-012 (LOT 1) — Plus AUCUN dock flottant. L'aide a désormais un seul
 * point d'entrée permanent, intégré à la navigation (entrée « Aide » du rail
 * desktop et de la barre mobile, cf. RailLeft/BottomBar). Ce composant ne monte
 * donc que deux surfaces, toutes deux hors-flux et non posées sur le contenu :
 *
 *   - `WelcomeDialog` : l'écran d'accueil du premier accès ;
 *   - `HelpPanel` : le panneau d'aide (visites + checklist), ouvert/fermé via le
 *     contexte `HelpPanelProvider` partagé avec les entrées de navigation.
 *
 * La checklist de démarrage ne s'affiche plus en dock : elle vit dans le panneau
 * d'aide, et sa progression est rappelée en tête de ce panneau.
 *
 * LOT 10 — SÉCURITÉ : aucun élément monté ici ne déclenche d'action métier.
 */

import { HelpPanel } from "./HelpPanel";
import { WelcomeDialog } from "./WelcomeDialog";

export function OnboardingLauncher() {
  return (
    <>
      <WelcomeDialog />
      <HelpPanel />
    </>
  );
}
