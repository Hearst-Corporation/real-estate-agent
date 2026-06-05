"use client";

import { TOTAL_BLOCKS, BLOCK_LABELS } from "@/lib/estimation/spec";

type Props = {
  block: number;
  confirmedCount: number;
};

export function WizardStepper({ block, confirmedCount }: Props) {
  const currentLabel = BLOCK_LABELS[Math.min(block, TOTAL_BLOCKS)] ?? "";

  return (
    <div className="est-wizard-stepper">
      <div className="est-stepper-dots">
        {Array.from({ length: TOTAL_BLOCKS }, (_, i) => {
          const idx = i + 1;
          const confirmed = idx <= confirmedCount;
          const current = idx === block && idx > confirmedCount;
          return (
            <span
              key={idx}
              className={`est-stepper-dot${confirmed ? " confirmed" : ""}${current ? " current" : ""}`}
              aria-label={`Bloc ${idx}`}
            />
          );
        })}
      </div>
      <div className="est-stepper-meta">
        <span className="est-stepper-count">
          {Math.min(confirmedCount, TOTAL_BLOCKS)}/{TOTAL_BLOCKS} blocs
        </span>
        <span className="est-stepper-label">{currentLabel}</span>
      </div>
    </div>
  );
}
