"use client";

/**
 * Product tour — PANCARTE (REA-ONBOARDING-011, LOT 1 + LOT 9).
 * =================================================================
 *
 * Accessibilité (non négociable) :
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby` :
 *     le lecteur d'écran annonce la visite et son contenu ;
 *   - le conteneur reçoit le focus à chaque étape (`tabIndex={-1}`), et le
 *     changement d'étape est annoncé (`aria-live="polite"`) ;
 *   - le focus n'est PAS piégé : Tab peut sortir de l'overlay, l'utilisateur
 *     n'est jamais coincé. Échap ferme (géré par le moteur) ;
 *   - le focus retourne à l'élément d'origine à la fermeture (géré par le
 *     provider) ;
 *   - boutons Précédent / Suivant / Terminer / Passer tous atteignables au
 *     clavier, focus visible fourni par la primitive Catalyst `<Button>` ;
 *   - `prefers-reduced-motion` respecté (variantes `motion-safe:`).
 *
 * LOT 10 : aucun bouton d'action métier ici. La pancarte navigue dans la
 * visite, rien d'autre.
 */

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/onboarding/types";
import { UI } from "@/lib/ui-strings";

export interface TourCoachMarkProps {
  step: TourStep;
  missing: boolean;
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

export function TourCoachMark({
  step,
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
}: TourCoachMarkProps) {
  const chrome = UI.onboarding.chrome;
  const baseId = useId().replace(/:/g, "");
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* Chaque étape reprend le focus : la navigation clavier suit la visite. */
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      className="w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-950/10 bg-white p-4 shadow-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {chrome.dialogLabel}
        </p>
        <p className="text-xs tabular-nums text-zinc-500" aria-live="polite">
          {chrome.stepLabel(Math.max(1, stepIndex + 1), stepCount)}
        </p>
      </div>

      <h2 id={titleId} className="mt-3 text-base font-semibold text-zinc-900">
        {step.title}
      </h2>

      <div id={bodyId} className="mt-2 space-y-2">
        <p className="text-sm/6 text-zinc-700">{step.body}</p>
        {step.consequence ? (
          <p className="text-sm/6 font-medium text-zinc-900">{step.consequence}</p>
        ) : null}
        {missing ? <p className="text-sm/6 text-zinc-500">{chrome.targetMissing}</p> : null}
        {resolving ? (
          <p className="text-sm/6 text-zinc-500" aria-live="polite">
            {chrome.loading}
          </p>
        ) : null}
      </div>

      <p className="mt-3 border-t border-zinc-950/5 pt-3 text-xs/5 text-zinc-500">
        {chrome.readOnly}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button plain onClick={onSkip}>
          {chrome.skip}
        </Button>
        <div className="flex items-center gap-2">
          <Button outline onClick={onPrev} disabled={isFirst}>
            {chrome.prev}
          </Button>
          {isLast ? (
            <Button color="indigo" onClick={onFinish}>
              {chrome.finish}
            </Button>
          ) : (
            <Button color="indigo" onClick={onNext}>
              {chrome.next}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
