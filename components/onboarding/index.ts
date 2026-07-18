/**
 * Product tour — point d'entrée public (REA-ONBOARDING-011).
 *
 * Les composants métier n'importent QUE d'ici :
 *   import { useProductTour, useTourActive } from "@/components/onboarding";
 */
export { ProductTourProvider, useProductTour, useTourActive } from "./ProductTourProvider";
export { TourOverlay } from "./TourOverlay";
export { TourCoachMark } from "./TourCoachMark";

/* Onboarding non intrusif (W6) : accueil, checklist dérivée, aide et relecture. */
export { OnboardingLauncher } from "./OnboardingLauncher";
export { OnboardingChecklist, OnboardingChecklistPanel, ChecklistList } from "./OnboardingChecklist";
export { HelpPanel, HELP_TOUR_ORDER } from "./HelpPanel";
export { PageTourButton, tourForPath } from "./PageTourButton";
export { WelcomeDialog } from "./WelcomeDialog";
