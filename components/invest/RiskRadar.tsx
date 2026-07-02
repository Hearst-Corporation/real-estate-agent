/**
 * RiskRadar — exposition au risque sur 6 axes (étude P8.9). Server component.
 * Consomme `ChartRisque` du moteur financier (notes /5, 5 = risque max). Radar
 * hexagonal SVG + légende textuelle (double encodage, WCAG). Tokens --ct-*.
 */
import type { ChartRisque } from "@/lib/invest/finance";

const SIZE = 180;
const C = SIZE / 2;
const R = 74; // rayon SVG relatif à SIZE (74 / 90 ≈ 82% du demi-espace)
const MAX = 5;
const RINGS = MAX;

/** Coordonnée d'un sommet : axe i sur n, à un rayon fractionnaire f∈[0,1]. */
function vertex(i: number, n: number, f: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n; // départ en haut, sens horaire
  return { x: C + R * f * Math.cos(angle), y: C + R * f * Math.sin(angle) };
}

function polygon(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function RiskRadar({ chart }: { chart: ChartRisque }) {
  const n = chart.axes.length;
  const shape = chart.axes.map((a, i) => vertex(i, n, Math.max(0, Math.min(1, a.note / MAX))));

  return (
    <div className="flex flex-col items-center gap-4 @xl:flex-row @xl:items-start @xl:gap-6">
      <svg
        className="w-full max-w-[220px] shrink-0"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Radar de risque : ${chart.axes.map((a) => `${a.label} ${a.note} sur 5`).join(", ")}`}
      >
        {/* anneaux concentriques */}
        {Array.from({ length: RINGS }, (_, r) => {
          const f = (r + 1) / RINGS;
          return (
            <polygon
              key={r}
              className="fill-none stroke-white/10"
              points={polygon(chart.axes.map((_, i) => vertex(i, n, f)))}
            />
          );
        })}
        {/* axes */}
        {chart.axes.map((_, i) => {
          const p = vertex(i, n, 1);
          return <line key={i} className="stroke-white/10" x1={C} y1={C} x2={p.x} y2={p.y} />;
        })}
        {/* forme du deal */}
        <polygon className="fill-indigo-400/20 stroke-indigo-400" strokeWidth={2} points={polygon(shape)} />
      </svg>
      <div className="flex w-full flex-col gap-1.5">
        {chart.axes.map((a) => (
          <div className="flex items-center justify-between gap-3 text-sm" key={a.key}>
            <span className="text-slate-400">{a.label}</span>
            <b className="text-slate-100">{a.note.toLocaleString("fr-FR")} / 5</b>
          </div>
        ))}
      </div>
    </div>
  );
}
