"use client";

/**
 * Product tour — OVERLAY + découpe spotlight (REA-ONBOARDING-011, LOT 1).
 * =================================================================
 *
 * Deux couches distinctes, volontairement séparées :
 *
 *   1. un BLOQUEUR plein écran (`pointer-events` actifs) qui avale tous les
 *      clics, y compris ceux visant la zone mise en évidence. C'est la garantie
 *      LOT 10 : le spotlight met en évidence, il ne « clique » jamais la cible
 *      et l'utilisateur ne peut pas déclencher l'action par mégarde ;
 *   2. un SVG purement décoratif (`pointer-events: none`, `aria-hidden`) qui
 *      assombrit l'écran SAUF la découpe, via un masque.
 *
 * Le rectangle vient du moteur (recalculé au scroll / resize / orientation).
 * `rect === null` → pas de découpe : la pancarte s'affiche au centre et
 * l'explication reste lisible. L'interface n'est JAMAIS bloquée sans issue :
 * Échap, « Passer » et « Terminer » restent toujours accessibles.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  computeCoachPosition,
  inflateRect,
  type Size,
  type Viewport,
} from "@/lib/onboarding/position";
import { spotlightPadding } from "@/lib/onboarding/progress";
import type { TourRect, TourStep } from "@/lib/onboarding/types";
import { TourCoachMark } from "./TourCoachMark";

/** Rayon de la découpe (aligné sur `rounded-xl` du DS). */
const SPOTLIGHT_RADIUS = 12;
/** Opacité du voile — contraste suffisant sans masquer le contexte. */
const DIM_OPACITY = 0.55;
/** Épaisseur du liseré accent autour de la cible. */
const RING_WIDTH = 2;
/** Largeur de repli de la pancarte tant qu'elle n'est pas mesurée (px). */
const COACH_FALLBACK: Size = { width: 320, height: 200 };

export interface TourOverlayProps {
  step: TourStep;
  /** Rectangle viewport-relatif de la cible, `null` = affichage centré. */
  rect: TourRect | null;
  /** Vrai si l'ancre était attendue mais reste introuvable. */
  missing: boolean;
  /** Vrai pendant la navigation / l'attente d'un élément asynchrone. */
  resolving: boolean;
  stepIndex: number;
  stepCount: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

function readViewport(): Viewport {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function TourOverlay({
  step,
  rect,
  missing,
  resolving,
  stepIndex,
  stepCount,
  isFirst,
  isLast,
  onNext,
  onPrev,
  onSkip,
  onFinish,
}: TourOverlayProps) {
  const maskId = useId().replace(/:/g, "");
  const coachRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [coachSize, setCoachSize] = useState<Size>(COACH_FALLBACK);

  /* Viewport : redimensionnement ET changement d'orientation. */
  useEffect(() => {
    const update = () => setViewport(readViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  /* Taille réelle de la pancarte → placement exact, sans débordement. */
  useLayoutEffect(() => {
    const node = coachRef.current;
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setCoachSize((prev) =>
        prev.width === r.width && prev.height === r.height
          ? prev
          : { width: r.width, height: r.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [step.id, missing, resolving]);

  const hole = rect ? inflateRect(rect, spotlightPadding(step)) : null;
  const position = computeCoachPosition(
    hole,
    coachSize,
    viewport.width > 0 ? viewport : readViewport(),
    step.placement,
  );

  /** Le bloqueur avale le clic : aucune action métier ne peut partir d'ici. */
  const swallow = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    // z au-dessus du plafond du shell (dialogues et assistant mobile sont en z-50).
    <div className="fixed inset-0 z-[60]">
      {/* Couche 1 — bloqueur de clics (couvre AUSSI la découpe). */}
      <div
        className="absolute inset-0"
        onClickCapture={swallow}
        onPointerDownCapture={swallow}
        aria-hidden="true"
      />

      {/* Couche 2 — voile + découpe, purement décoratif. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole ? (
              <rect
                x={hole.left}
                y={hole.top}
                width={Math.max(0, hole.width)}
                height={Math.max(0, hole.height)}
                rx={SPOTLIGHT_RADIUS}
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          className="text-zinc-950"
          fill="currentColor"
          fillOpacity={DIM_OPACITY}
          mask={`url(#${maskId})`}
        />
        {hole ? (
          <rect
            x={hole.left}
            y={hole.top}
            width={Math.max(0, hole.width)}
            height={Math.max(0, hole.height)}
            rx={SPOTLIGHT_RADIUS}
            fill="none"
            className="text-accent-500"
            stroke="currentColor"
            strokeWidth={RING_WIDTH}
          />
        ) : null}
      </svg>

      {/* Couche 3 — la pancarte, seule zone interactive de l'overlay. */}
      <div
        ref={coachRef}
        className="pointer-events-auto absolute motion-safe:transition-opacity motion-safe:duration-200"
        style={{ top: position.top, left: position.left }}
      >
        <TourCoachMark
          step={step}
          missing={missing}
          resolving={resolving}
          stepIndex={stepIndex}
          stepCount={stepCount}
          isFirst={isFirst}
          isLast={isLast}
          onNext={onNext}
          onPrev={onPrev}
          onSkip={onSkip}
          onFinish={onFinish}
        />
      </div>
    </div>
  );
}
