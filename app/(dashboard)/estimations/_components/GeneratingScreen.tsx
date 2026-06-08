"use client";

import { UI } from "@/lib/ui-strings";

type Props = {
  currentStep: string | null;
};

export function GeneratingScreen({ currentStep }: Props) {
  const steps = UI.estimations.generatingSteps;

  const currentIdx = currentStep
    ? steps.findIndex((s) =>
        currentStep.toLowerCase().includes(s.toLowerCase())
      )
    : -1;

  return (
    <div className="est-generating">
      <div className="est-generating-inner">
        <div className="est-generating-icon">
          <span className="est-generating-pulse" />
        </div>

        <h2 className="est-generating-title">{UI.estimations.generatingTitle}</h2>
        <p className="est-generating-sub">{UI.estimations.generatingSub}</p>

        <div className="est-generating-steps">
          {steps.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div
                key={step}
                className={`est-gen-step${done ? " done" : ""}${active ? " active" : ""}`}
              >
                <span className="est-gen-step-icon" aria-hidden="true">
                  {done ? "✓" : active ? "▶" : "·"}
                </span>
                <span className="est-gen-step-label">{step}</span>
                {active && <span className="est-gen-step-spinner" aria-hidden="true" />}
              </div>
            );
          })}
        </div>

        {currentStep && (
          <p className="est-generating-current" aria-live="polite">{currentStep}</p>
        )}
      </div>
    </div>
  );
}
