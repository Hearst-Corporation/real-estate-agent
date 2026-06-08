/**
 * BarList — liste de barres horizontales (label + valeur + piste remplie).
 * Server component. Style cockpit dédié, sans dépendance aux vues estimation.
 * Seul `width` passe en style inline (piloté par la donnée) ; le reste vient du CSS.
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
          <div className="ct-chart-bar-track">
            {/* largeur pilotée par la donnée → style inline (tout le reste vient du CSS) */}
            <div
              className="ct-chart-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
