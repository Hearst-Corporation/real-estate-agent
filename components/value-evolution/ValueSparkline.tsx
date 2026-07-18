/**
 * components/value-evolution/ValueSparkline.tsx — mini-graphe d'évolution de valeur.
 *
 * SVG INLINE, zéro lib externe. Rend une sparkline (ligne + aire + point final)
 * à partir des points d'une série. `viewBox` + `preserveAspectRatio="none"` →
 * responsive fluide de 390 (mobile) à 1440 (desktop) sans media query.
 *
 * Couleurs SÉMANTIQUES d'état (hausse=emerald, baisse=rose) : ce fichier doit
 * figurer dans STATE_COLOR_OK de scripts/check-catalyst.mjs (voir rapport worker).
 * Accessibilité : role="img" + aria-label chiffré, focus clavier hérité du conteneur.
 */

import type { ValuePoint, ValueVariation } from "@/lib/value-evolution/types";
import { formatDeltaEur, formatPct } from "@/lib/value-evolution/detect";

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

type Tone = "up" | "down" | "flat";

function toneOf(variation: ValueVariation | null): Tone {
  if (!variation) return "flat";
  return variation.direction;
}

const STROKE: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  flat: "text-zinc-400 dark:text-zinc-500",
};
const CHIP: Record<Tone, string> = {
  up: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  down: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  flat: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export type ValueSparklineProps = {
  points: ValuePoint[];
  variation: ValueVariation | null;
  label?: string;
  /** Hauteur du tracé en unités viewBox (largeur fluide 100%). */
  height?: number;
};

/** Coordonnées SVG normalisées dans un viewBox 100×H (padding vertical). */
function toPath(values: number[], w: number, h: number, pad: number): { line: string; area: string; last: { x: number; y: number } } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  const usableH = h - pad * 2;
  const coords = values.map((v, i) => ({
    x: i * stepX,
    y: pad + (usableH - ((v - min) / span) * usableH),
  }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `${line} L${w.toFixed(2)},${h.toFixed(2)} L0,${h.toFixed(2)} Z`;
  return { line, area, last: coords[coords.length - 1] };
}

export function ValueSparkline({ points, variation, label, height = 48 }: ValueSparklineProps) {
  const tone = toneOf(variation);
  const values = points.map((p) => p.value);

  if (values.length === 0) {
    return (
      <div className="text-xs text-zinc-500 dark:text-zinc-400" role="status">
        Aucune donnée de valeur
      </div>
    );
  }

  const W = 100;
  const H = height;
  const single = values.length < 2;
  const { line, area, last } = single
    ? { line: "", area: "", last: { x: W, y: H / 2 } }
    : toPath(values, W, H, 4);

  const first = points[0];
  const latest = points[points.length - 1];
  const pctLabel = variation ? formatPct(variation.deltaPct) : "";
  const eurLabel = variation ? formatDeltaEur(variation.deltaEur) : "";
  const ariaLabel = `Évolution de valeur${label ? ` de ${label}` : ""} : ${EUR.format(first.value)} le ${new Date(first.at).toLocaleDateString("fr-FR")}, ${EUR.format(latest.value)} le ${new Date(latest.at).toLocaleDateString("fr-FR")}${variation ? `, soit ${pctLabel} (${eurLabel})` : ""}.`;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`h-12 w-full ${STROKE[tone]}`}
        role="img"
        aria-label={ariaLabel}
      >
        {!single && (
          <>
            <path d={area} fill="currentColor" opacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        <circle cx={last.x} cy={last.y} r={2.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
      </svg>

      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {EUR.format(latest.value)}
        </span>
        {variation && (
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${CHIP[tone]}`}
          >
            {tone === "up" ? "▲" : tone === "down" ? "▼" : "→"} {pctLabel}
            <span className="ml-1 opacity-70">{eurLabel}</span>
          </span>
        )}
        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          {points.length} estimation{points.length > 1 ? "s" : ""}
        </span>
      </figcaption>
    </figure>
  );
}

export default ValueSparkline;
