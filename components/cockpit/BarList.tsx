/**
 * BarList — liste de barres horizontales (label + valeur + piste remplie).
 * Server component. Réutilise la piste .est-fiche-bar-track/.est-fiche-bar-fill.
 * Le style inline width est l'unique exception tolérée (largeur data-driven).
 */

import type { BarItem } from "@/lib/crm/aggregate";

type BarListProps = {
  items: BarItem[];
  emptyLabel: string;
};

export function BarList({ items, emptyLabel }: BarListProps) {
  if (items.length === 0) {
    return <p className="ct-chart-empty">{emptyLabel}</p>;
  }

  return (
    <div className="ct-chart-barlist">
      {items.map((item) => (
        <div className="ct-chart-barlist-item" key={item.label}>
          <div className="ct-chart-barlist-head">
            <span className="ct-chart-barlist-label">{item.label}</span>
            <span className="ct-chart-barlist-value">{item.value}</span>
          </div>
          <div className="est-fiche-bar-track">
            {/* largeur data-driven : seul style inline toléré (cf. cockpit.css) */}
            <div
              className="est-fiche-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
