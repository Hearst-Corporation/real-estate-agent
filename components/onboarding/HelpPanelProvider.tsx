"use client";

/**
 * Point d'accès UNIQUE et PARTAGÉ à l'aide (REA-UX-012, LOT 1).
 * =================================================================
 *
 * Avant : un dock flottant à trois boutons posé en bas à gauche, au-dessus du
 * contenu. Désormais l'aide a UN SEUL point d'entrée permanent, intégré à la
 * navigation — l'entrée « Aide » du rail (desktop) et de la barre mobile. Ces
 * deux entrées vivent dans des arbres différents (RailLeft, BottomBar) et
 * doivent piloter le MÊME panneau, monté une seule fois dans le shell : d'où ce
 * contexte minimal, qui ne porte QUE l'état d'ouverture du panneau.
 *
 * Aucune logique de visite ici : le moteur (ProductTourProvider) reste séparé.
 * Hors provider, `useHelpPanel` renvoie un état inerte — jamais d'exception.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface HelpPanelContextValue {
  open: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
}

const INERT: HelpPanelContextValue = {
  open: false,
  openHelp: () => {},
  closeHelp: () => {},
  toggleHelp: () => {},
};

const HelpPanelContext = createContext<HelpPanelContextValue | null>(null);

export function useHelpPanel(): HelpPanelContextValue {
  return useContext(HelpPanelContext) ?? INERT;
}

export function HelpPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openHelp = useCallback(() => setOpen(true), []);
  const closeHelp = useCallback(() => setOpen(false), []);
  const toggleHelp = useCallback(() => setOpen((o) => !o), []);

  const value = useMemo<HelpPanelContextValue>(
    () => ({ open, openHelp, closeHelp, toggleHelp }),
    [open, openHelp, closeHelp, toggleHelp],
  );

  return <HelpPanelContext.Provider value={value}>{children}</HelpPanelContext.Provider>;
}
