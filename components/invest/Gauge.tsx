/**
 * Gauge — jauge LTV en demi-arc SVG (étude P8.10). Server component.
 * Consomme `ChartLtvGauge` du moteur financier. Demi-cercle 180°, aiguille
 * pointant la valeur, seuils 60/70/80 % affichés. SVG pur, tokens --ct-*.
 *
 * Texte alternatif : la valeur + interprétation sont dans le DOM (visible).
 */
import type { ChartLtvGauge } from "@/lib/invest/finance";
import { pct } from "./format";

const W = 200;
const H = 116;
const CX = 100;
const CY = 104;
const R = 88;
const GAUGE_STROKE = 12;
const GAUGE_TICK_STROKE = 2;

/** Point sur l'arc pour une fraction t∈[0,1] (gauche→droite, demi-cercle haut). */
function polar(t: number): { x: number; y: number } {
  const angle = Math.PI * (1 - t); // π (gauche) → 0 (droite)
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

function arcPath(from: number, to: number): string {
  const a = polar(from);
  const b = polar(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function Gauge({ chart }: { chart: ChartLtvGauge }) {
  const v = Math.max(0, Math.min(1, chart.valeur));
  const needle = polar(v);
  const valueLabel = pct(chart.valeur, 1);

  return (
    <div className="inv-gauge">
      <svg
        className="inv-gauge-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`LTV ${valueLabel}, seuils ${Math.round(chart.seuils.vert * 100)}, ${Math.round(chart.seuils.orange * 100)} et ${Math.round(chart.seuils.rouge * 100)} pourcent`}
      >
        <path className="inv-gauge-track" d={arcPath(0, 1)} strokeWidth={GAUGE_STROKE} />
        <path className="inv-gauge-arc" d={arcPath(0, v)} strokeWidth={GAUGE_STROKE} />
        {/* repères de seuils */}
        {[chart.seuils.vert, chart.seuils.orange, chart.seuils.rouge].map((s) => {
          const p = polar(Math.min(1, s));
          const inner = { x: CX + (R - 9) * Math.cos(Math.PI * (1 - s)), y: CY - (R - 9) * Math.sin(Math.PI * (1 - s)) };
          return <line key={s} x1={inner.x} y1={inner.y} x2={p.x} y2={p.y} className="inv-gauge-track" strokeWidth={GAUGE_TICK_STROKE} />;
        })}
        <line className="inv-gauge-needle" x1={CX} y1={CY} x2={needle.x} y2={needle.y} />
        <circle cx={CX} cy={CY} r={4} fill="var(--ct-text-strong)" />
      </svg>
      <div className="inv-gauge-val">{valueLabel}</div>
      <div className="inv-gauge-scale">
        <span>0%</span>
        <span>{Math.round(chart.seuils.vert * 100)}%</span>
        <span>{Math.round(chart.seuils.rouge * 100)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
