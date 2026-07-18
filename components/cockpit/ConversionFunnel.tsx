/**
 * ConversionFunnel — entonnoir SVG inline du pipeline de conversion.
 *
 * Data-viz : chaque bande = un étage réel, largeur ∝ count/topCount. Cliquable →
 * navigation vers la liste filtrée réelle (href porté par la donnée). Responsive
 * via viewBox + width:100% (rend identique de 390 à 1440). Couleurs sémantiques
 * d'état (accent = progression, red = perte) porteuses de sens → composant
 * data-viz cockpit (exempt de la règle mono-accent, comme Donut/Funnel/BarList).
 *
 * Server component pur (aucun état) : les clics sont de simples <a>.
 */
import Link from "next/link";
import type { FunnelStage } from "@/lib/conversion/types";

type Props = {
  stages: FunnelStage[];
  labels: Record<string, string>;
  /** Libellés courts injectés (évite un couplage aux strings). */
  ui: { stepRate: string; openList: string };
  emptyLabel: string;
};

// Géométrie du canvas SVG (unités = coordonnées viewBox, pas des px écran).
const W = 100;
const ROW_H = 13;
const GAP = 3;
const PAD_Y = 2;
const MIN_W = 6; // largeur plancher pour rester cliquable/lisible

export function ConversionFunnel({ stages, labels, ui, emptyLabel }: Props) {
  const top = stages[0]?.count ?? 0;
  if (top === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">{emptyLabel}</p>;
  }

  const height = PAD_Y * 2 + stages.length * ROW_H + (stages.length - 1) * GAP;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        role="img"
        aria-label="Entonnoir de conversion"
        preserveAspectRatio="xMidYMid meet"
      >
        {stages.map((stage, i) => {
          const ratio = top > 0 ? stage.count / top : 0;
          const barW = Math.max(MIN_W, ratio * W);
          const x = (W - barW) / 2;
          const y = PAD_Y + i * (ROW_H + GAP);
          const isWon = stage.id === "won";
          // Dégradé de progression : accent qui s'assombrit vers le gain.
          const fill = isWon ? "var(--color-accent-600)" : "var(--color-accent-500)";
          const opacity = 0.55 + (i / Math.max(1, stages.length - 1)) * 0.45;
          const label = labels[stage.id] ?? stage.id;
          return (
            <Link key={stage.id} href={stage.href} aria-label={`${label} — ${stage.count} · ${ui.openList}`}>
              <g className="cursor-pointer opacity-90 transition-opacity duration-150 hover:opacity-100">
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={ROW_H}
                  rx={1.5}
                  fill={fill}
                  fillOpacity={opacity}
                />
                <text
                  x={W / 2}
                  y={y + ROW_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={3.4}
                  className="fill-white font-semibold"
                >
                  {label} · {stage.count}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>

      {/* Légende textuelle accessible : étage, count, taux de passage, lien réel. */}
      <ul className="mt-4 flex flex-col gap-2">
        {stages.map((stage) => (
          <li key={stage.id}>
            <Link
              href={stage.href}
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-zinc-950/[0.04] focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              <span className="flex-1 text-sm text-zinc-700">{labels[stage.id] ?? stage.id}</span>
              {stage.stepRate !== null ? (
                <span className="text-xs text-zinc-400 tabular-nums">
                  {Math.round(stage.stepRate * 100)} % {ui.stepRate}
                </span>
              ) : null}
              <span className="w-10 text-right text-sm font-semibold text-zinc-900 tabular-nums">
                {stage.count}
              </span>
              <span className="text-xs font-medium text-accent-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {ui.openList} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
