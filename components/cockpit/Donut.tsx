/**
 * Donut — anneau de progression premium (SVG pur, server component).
 * Convention catalog Cockpit : <circle> tourné -90deg, stroke-dasharray = 2πr,
 * stroke-dashoffset = 2πr·(1 - value/100). Tokens --ct-* uniquement (le gradient
 * et le glow réfèrent les tokens via currentColor / variables CSS).
 */

type DonutProps = {
  /** Valeur 0–100. */
  value: number;
  /** Texte au centre (ex: "32%"). Par défaut `${value}%`. */
  centerLabel?: string;
  /** Libellé sous la valeur (ex: "Conversion"). */
  sublabel?: string;
  /** Diamètre en px (attribut SVG, pas de style inline). Défaut 132. */
  size?: number;
  /** Épaisseur de l'anneau. Défaut 12. */
  stroke?: number;
  /** Anneau en couleur d'accent plutôt que blanc. */
  accent?: boolean;
};

export function Donut({
  value,
  centerLabel,
  sublabel,
  size = 132,
  stroke = 12,
  accent = false,
}: DonutProps) {
  const safe = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - safe / 100);
  const center = size / 2;
  const gid = accent ? "ct-donut-grad-accent" : "ct-donut-grad";
  const fid = "ct-donut-glow";

  return (
    <div className="ct-chart-donut">
      <svg
        className="ct-chart-donut-ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${safe}%`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop
              offset="0%"
              stopColor={accent ? "var(--ct-accent-maroon)" : "var(--ct-text-body)"}
            />
            <stop
              offset="100%"
              stopColor={accent ? "var(--ct-accent-strong)" : "var(--ct-text-strong)"}
            />
          </linearGradient>
          <filter id={fid} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="ct-chart-donut-track"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className="ct-chart-donut-fill"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          stroke={`url(#${gid})`}
          filter={`url(#${fid})`}
        />
      </svg>
      <div className="ct-chart-donut-center">
        <span className="ct-chart-donut-value">{centerLabel ?? `${safe}%`}</span>
        {sublabel && <span className="ct-chart-donut-label">{sublabel}</span>}
      </div>
    </div>
  );
}
