/**
 * components/invest — barrel des 15 primitives front du domaine invest (Epic 0.4).
 *
 * Liste (étude 02 §2 / §10) :
 *   1. Stepper          7. Waterfall        13. DealCard
 *   2. Skeleton         8. Gauge            14. StatusPill
 *   3. Toast            9. LegalNatureBadge 15. ProductBadges
 *   4. Banner          10. RiskRadar
 *   5. Gate            11. ScenarioBars
 *   6. Timeline        12. SensitivityCurve
 *
 * Toutes en tokens --ct-* (cf. app/cockpit.css §INVEST). Charts en SVG/CSS pur,
 * AUCUNE dépendance de charting. RSC par défaut (aucune n'est "use client").
 */

export { Stepper, type Step } from "./Stepper";
export { Skeleton, SkeletonCard } from "./Skeleton";
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
  LegalBadge,
  dealBadges,
  type ProductBadge,
  type BadgeFamily,
} from "./ProductBadges";

// Helpers de présentation partagés.
export { eur, pct, compact } from "./format";
