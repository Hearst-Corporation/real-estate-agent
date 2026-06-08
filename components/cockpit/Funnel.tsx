/**
 * Funnel — entonnoir vertical par statut (pipeline). Server component.
 * Largeur de barre = count / maxCount. Tonalité via .crm-status (is-positive…).
 * Seul `width` passe en style inline (piloté par la donnée) ; le reste vient du CSS.
 */

import type { FunnelStep } from "@/lib/crm/aggregate";

type FunnelProps = {
  steps: FunnelStep[];
  emptyLabel: string;
};

export function Funnel({ steps, emptyLabel }: FunnelProps) {
  const max = steps.reduce((m, s) => Math.max(m, s.count), 0);

  if (max === 0) {
    return <p className="ct-chart-empty">{emptyLabel}</p>;
  }

  return (
    <div className="ct-chart-funnel">
      {steps.map((step, index) => (
        <div className="ct-chart-funnel-step" key={step.label}>
          <div className="ct-chart-funnel-head">
            <span className="ct-chart-funnel-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="ct-chart-funnel-label">{step.label}</span>
            <span className="ct-chart-funnel-count">{step.count}</span>
          </div>
          <div className="ct-chart-funnel-track">
            {/* largeur pilotée par la donnée → style inline (tout le reste vient du CSS) */}
            <div
              className={`ct-chart-funnel-bar${step.tone ? ` ${step.tone}` : ""}`}
              style={{ width: `${Math.round((step.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
