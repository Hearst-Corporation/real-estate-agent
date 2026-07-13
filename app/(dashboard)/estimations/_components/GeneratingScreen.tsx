"use client";

import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
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
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="relative flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-400/30" />
          <span className="relative size-4 rounded-full bg-accent-400" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Heading className="font-titre">{UI.estimations.generatingTitle}</Heading>
          <Text>{UI.estimations.generatingSub}</Text>
        </div>

        <div className="surface flex w-full flex-col gap-2 p-4 text-left">
          {steps.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div
                key={step}
                className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                  active
                    ? "bg-accent-500/10 text-accent-700"
                    : done
                      ? "text-zinc-700"
                      : "text-zinc-500"
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    done
                      ? "bg-accent-500/20 text-accent-600"
                      : active
                        ? "bg-accent-500/20 text-accent-600"
                        : "bg-zinc-950/5 text-zinc-500"
                  }`}
                  aria-hidden="true"
                >
                  {done ? "✓" : active ? "▶" : "·"}
                </span>
                <span className="flex-1">{step}</span>
                {active && (
                  <span
                    className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-400"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>

        {currentStep && (
          <p className="text-xs text-zinc-500" aria-live="polite">{currentStep}</p>
        )}
      </div>
    </div>
  );
}
