/**
 * components/invest — barrel des primitives front du domaine invest (Epic 0.4).
 *
 * Charts en SVG/CSS pur, AUCUNE dépendance de charting. RSC par défaut (aucune
 * n'est "use client"). Le skeleton de chargement partagé vit dans
 * `components/cockpit/Skeleton.tsx` (pas de doublon ici).
 */

export { Stepper, type Step } from "./Stepper";
export { Toast, type ToastTone } from "./Toast";
export { Banner, type BannerTone } from "./Banner";
export { Gate } from "./Gate";
export { Timeline, type Milestone, type MilestoneState } from "./Timeline";
export { Waterfall } from "./Waterfall";
export { Gauge } from "./Gauge";
export { LegalNatureBadge } from "./LegalNatureBadge";
export { RiskRadar } from "./RiskRadar";
export { ScenarioBars } from "./ScenarioBars";
export { SensitivityCurve } from "./SensitivityCurve";
export { DealCard, type DealCardData } from "./DealCard";
export { StatusPill, type StatusTone } from "./StatusPill";
export {
  ProductBadges,
  dealBadges,
  type ProductBadge,
  type BadgeFamily,
} from "./ProductBadges";

// Helpers de présentation partagés.
export { eur, pct } from "./format";
