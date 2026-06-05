/**
 * Donut — anneau de progression unique (SVG pur, server component).
 * Convention catalog Cockpit : <circle> tourné -90deg, stroke-dasharray = 2πr,
 * stroke-dashoffset = 2πr·(1 - value/100). Tokens --ct-* uniquement.
 */

type DonutProps = {
  /** Valeur 0–100. */
  value: number;
  /** Texte au centre (ex: "32%"). Par défaut `${value}%`. */
  centerLabel?: string;
  /** Libellé sous la valeur (ex: "Conversion"). */
  sublabel?: string;
  /** Diamètre en px (attribut SVG, pas de style inline). Défaut 120. */
  size?: number;
  /** Épaisseur de l'anneau. Défaut 10. */
  stroke?: number;
  /** Anneau en couleur d'accent plutôt que blanc. */
  accent?: boolean;
};

export function Donut({
  value,
  centerLabel,
  sublabel,
  size = 120,
  stroke = 10,
  accent = false,
}: DonutProps) {
  const safe = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - safe / 100);
  const center = size / 2;

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
        <circle
          className="ct-chart-donut-track"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className={accent ? "ct-chart-donut-fill accent" : "ct-chart-donut-fill"}
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ct-chart-donut-center">
        <span className="ct-chart-donut-value">{centerLabel ?? `${safe}%`}</span>
        {sublabel && <span className="ct-chart-donut-label">{sublabel}</span>}
      </div>
    </div>
  );
}
