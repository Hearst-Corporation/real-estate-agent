"use client";

/**
 * Point de montage UNIQUE de l'onboarding dans le shell authentifié (LOT 4/6/7).
 * =================================================================
 *
 * Un seul ajout dans `CockpitShell` amène :
 *   - l'écran d'accueil du premier accès (LOT 4) ;
 *   - la checklist de démarrage, compacte et réductible (LOT 6) ;
 *   - l'entrée discrète « Aide et visites guidées » + « Découvrir cette page »
 *     (LOT 7).
 *
 * PLACEMENT : dock flottant en bas à gauche, hors du flux — aucun header n'est
 * modifié, aucune page n'est éditée. Sur mobile il remonte au-dessus de la
 * barre de navigation et reste à gauche du bouton d'assistant (`right-4`), donc
 * sans recouvrement. Il s'efface pendant une visite guidée pour ne jamais
 * masquer la cible mise en évidence.
 *
 * LOT 10 — SÉCURITÉ : aucun élément monté ici ne déclenche d'action métier.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UI } from "@/lib/ui-strings";
import { HelpPanel } from "./HelpPanel";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { PageTourButton } from "./PageTourButton";
import { WelcomeDialog } from "./WelcomeDialog";
import { useProductTour } from "./ProductTourProvider";

export function OnboardingLauncher() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { tourActive } = useProductTour();

  return (
    <>
      <WelcomeDialog />

      {/*
        `z-30` : au-dessus du contenu, sous l'overlay de visite (z-50) et sous la
        feuille d'assistant mobile. `pointer-events-none` sur le conteneur pour
        ne rien intercepter entre les contrôles.
      */}
      <div className="pointer-events-none fixed bottom-20 left-4 z-30 flex flex-col items-start gap-2 sm:bottom-4 sm:left-rail-left sm:ml-4">
        <div className="pointer-events-auto">
          <OnboardingChecklist />
        </div>
        {!tourActive && (
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              outline
              onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              aria-label={UI.onboarding.help.entry}
            >
              <span className="text-xs">{UI.onboarding.help.entry}</span>
            </Button>
            <PageTourButton />
          </div>
        )}
      </div>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
