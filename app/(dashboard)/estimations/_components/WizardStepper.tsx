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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const filled = i < collected;
          const current = i === collected && !canGenerate;
          return (
            <span
              key={i}
              className={`size-2 rounded-full transition-colors ${
                filled
                  ? "bg-indigo-400"
                  : current
                    ? "bg-white/20 ring-2 ring-indigo-400/50"
                    : "bg-white/15"
              }`}
              aria-label={`Info clé ${i + 1}`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          {UI.estimations.keyInfoProgress(Math.min(collected, total), total)}
        </span>
        <span className="text-zinc-500">{focus}</span>
      </div>
    </div>
  );
}
