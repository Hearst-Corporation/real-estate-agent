/**
 * Funnel — entonnoir vertical par statut (pipeline). Server component.
 * Largeur de barre = count / maxCount. Tonalité via .crm-status (is-positive…).
 * Le style inline width est l'unique exception tolérée (largeur data-driven).
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
      {steps.map((step) => (
        <div className="ct-chart-funnel-step" key={step.label}>
          <div className="ct-chart-funnel-head">
            <span className="ct-chart-funnel-label">{step.label}</span>
            <span className="ct-chart-funnel-count">{step.count}</span>
          </div>
          <div className="ct-chart-funnel-track">
            {/* largeur data-driven : seul style inline toléré (cf. cockpit.css) */}
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
