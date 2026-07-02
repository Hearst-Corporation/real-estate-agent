/**
 * BarList — liste de barres horizontales (label + valeur + piste remplie).
 * Server component. Seul `width` passe en style inline (piloté par la donnée).
 */

import type { BarItem } from "@/lib/crm/aggregate";

type BarListProps = {
  items: BarItem[];
  emptyLabel: string;
};

export function BarList({ items, emptyLabel }: BarListProps) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div className="flex flex-col gap-1.5" key={item.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{item.label}</span>
            <span className="font-semibold text-slate-100 tabular-nums">{item.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            {/* largeur pilotée par la donnée → style inline (tout le reste vient des utilities) */}
            <div
              className="h-full rounded-full bg-indigo-400 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
