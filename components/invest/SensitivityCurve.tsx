/**
 * SensitivityCurve — sensibilité d'un paramètre → rendement (étude P8.6/7).
 * Server component. Consomme `ChartSensibilitePrix | ChartSensibiliteRetard`.
 * Sparkline SVG (aire + ligne), ligne zéro (perte/gain) et repère de point mort
 * quand fourni. SVG pur, tokens --ct-*.
 */
import type { ChartSensibilitePrix, ChartSensibiliteRetard } from "@/lib/invest/finance";
import { pct } from "./format";

type SensChart = ChartSensibilitePrix | ChartSensibiliteRetard;

const W = 320;
const H = 120;
const PAD = 8; // = --ct-space-xs

export function SensitivityCurve({ chart }: { chart: SensChart }) {
  const pts = chart.points.filter((p) => p.irr != null) as Array<{ x: number; irr: number }>;
  if (pts.length < 2) {
    return <p className="ct-chart-empty">Données de sensibilité indisponibles.</p>;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.irr);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 0);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const sx = (x: number) => PAD + ((x - xMin) / xSpan) * (W - 2 * PAD);
  const sy = (y: number) => PAD + (1 - (y - yMin) / ySpan) * (H - 2 * PAD);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.irr).toFixed(1)}`).join(" ");
  const area = `${line} L ${sx(xMax).toFixed(1)} ${sy(yMin).toFixed(1)} L ${sx(xMin).toFixed(1)} ${sy(yMin).toFixed(1)} Z`;
  const zeroY = sy(0);
  const pointMort = "point_mort_x" in chart ? chart.point_mort_x : null;

  return (
    <div className="inv-sensitivity">
      <svg
        className="inv-sensitivity-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${chart.titre}. ${chart.x_label}.`}
      >
        <path className="inv-sens-area" d={area} />
        <line className="inv-sens-zero" x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} />
        {pointMort != null ? (
          <line className="inv-sens-breakeven" x1={sx(pointMort)} y1={PAD} x2={sx(pointMort)} y2={H - PAD} />
        ) : null}
        <path className="inv-sens-line" d={line} />
      </svg>
      <div className="inv-sensitivity-axis">
        <span>{chart.x_label}</span>
        {pointMort != null ? <span>Point mort : {pct(pointMort)}</span> : <span>Ligne zéro = seuil de perte</span>}
      </div>
    </div>
  );
}
