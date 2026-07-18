/**
 * Product tour — point d'entrée public (REA-ONBOARDING-011).
 *
 * Les composants métier n'importent QUE d'ici :
 *   import { useProductTour, useTourActive } from "@/components/onboarding";
 */
export { ProductTourProvider, useProductTour, useTourActive } from "./ProductTourProvider";
export { TourOverlay } from "./TourOverlay";
export { TourCoachMark } from "./TourCoachMark";

/* Onboarding non intrusif : accueil, checklist dérivée, aide et relecture.
   REA-UX-012 (LOT 1) : plus de dock flottant — un seul point d'accès permanent
   via l'entrée « Aide » de la navigation, pilotée par HelpPanelProvider. */
export { OnboardingLauncher } from "./OnboardingLauncher";
export { OnboardingChecklistPanel, ChecklistList, useChecklistSummary } from "./OnboardingChecklist";
export { HelpPanel, HELP_TOUR_ORDER } from "./HelpPanel";
export { HelpPanelProvider, useHelpPanel } from "./HelpPanelProvider";
export { tourForPath } from "./PageTourButton";
export { WelcomeDialog } from "./WelcomeDialog";
