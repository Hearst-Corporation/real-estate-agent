/**
 * Product tour — point d'entrée public (REA-ONBOARDING-011).
 *
 * Les composants métier n'importent QUE d'ici :
 *   import { useProductTour, useTourActive } from "@/components/onboarding";
 */
export { ProductTourProvider, useProductTour, useTourActive } from "./ProductTourProvider";
export { TourOverlay } from "./TourOverlay";
export { TourCoachMark } from "./TourCoachMark";
