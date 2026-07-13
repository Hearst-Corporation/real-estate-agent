/**
 * Funnel — entonnoir vertical par statut (pipeline). Server component.
 * Largeur de barre = count / maxCount.
 * Seul `width` passe en style inline (piloté par la donnée) ; le reste vient des utilities.
 */

import type { FunnelStep } from "@/lib/crm/aggregate";

type FunnelProps = {
  steps: FunnelStep[];
  emptyLabel: string;
};

const TONE_BAR: Record<string, string> = {
  "is-positive": "bg-emerald-500",
  "is-warning": "bg-amber-500",
  "is-negative": "bg-red-500",
};

export function Funnel({ steps, emptyLabel }: FunnelProps) {
  const max = steps.reduce((m, s) => Math.max(m, s.count), 0);

  if (max === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <div className="flex flex-col gap-1.5" key={step.label}>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs text-slate-500">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-zinc-700">{step.label}</span>
            <span className="font-semibold text-zinc-900 tabular-nums">{step.count}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-950/10">
            {/* largeur pilotée par la donnée → style inline (tout le reste vient des utilities) */}
            <div
              className={`h-full rounded-full transition-all ${
                step.tone ? (TONE_BAR[step.tone] ?? "bg-accent-500") : "bg-accent-500"
              }`}
              style={{ width: `${Math.round((step.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
