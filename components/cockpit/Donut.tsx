/**
 * Donut — anneau de progression premium (SVG pur, server component).
 * Convention : <circle> tourné -90deg, stroke-dasharray = 2πr,
 * stroke-dashoffset = 2πr·(1 - value/100).
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

const GLOW_BLUR = 3;

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
  const gid = accent ? "donut-grad-accent" : "donut-grad";
  const fid = "donut-glow";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${safe}%`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent ? "#818cf8" : "#52525b"} />
            <stop offset="100%" stopColor={accent ? "#a5b4fc" : "#18181b"} />
          </linearGradient>
          <filter id={fid} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={GLOW_BLUR} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="fill-none stroke-zinc-950/10"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className="fill-none"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          stroke={`url(#${gid})`}
          filter={`url(#${fid})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-zinc-900">{centerLabel ?? `${safe}%`}</span>
        {sublabel && <span className="text-xs text-zinc-500">{sublabel}</span>}
      </div>
    </div>
  );
}
