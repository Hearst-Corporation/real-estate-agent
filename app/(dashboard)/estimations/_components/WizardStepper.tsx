"use client";

import { UI } from "@/lib/ui-strings";
import type { Coverage } from "@/lib/estimation/spec";

type Props = {
  coverage: Coverage;
  nextLabel: string | null;
  canGenerate: boolean;
};

export function WizardStepper({ coverage, nextLabel, canGenerate }: Props) {
  const { collected, total } = coverage;
  const focus = canGenerate
    ? UI.estimations.readyToGenerate
    : nextLabel
      ? UI.estimations.nextInfo(nextLabel)
      : UI.estimations.allKeyInfo;

  return (
    <div className="est-wizard-stepper">
      <div className="est-stepper-dots">
        {Array.from({ length: total }, (_, i) => {
          const filled = i < collected;
          const current = i === collected && !canGenerate;
          return (
            <span
              key={i}
              className={`est-stepper-dot${filled ? " confirmed" : ""}${current ? " current" : ""}`}
              aria-label={`Info clé ${i + 1}`}
            />
          );
        })}
      </div>
      <div className="est-stepper-meta">
        <span className="est-stepper-count">
          {UI.estimations.keyInfoProgress(Math.min(collected, total), total)}
        </span>
        <span className="est-stepper-label">{focus}</span>
      </div>
    </div>
  );
}
