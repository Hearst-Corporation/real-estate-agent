"use client";

/**
 * ZoneRadar — Radar 6 axes + KPIs pour une zone de marché.
 * Adapté de RiskRadar (invest) pour les axes d'attractivité marché.
 * Server-compatible mais marqué client car consommé par MarketPanel (client).
 */

import { TENDANCE_LABEL, TENDANCE_TONE, type ZoneMarche } from "@/lib/market/zones";

const SIZE = 220;
const C = SIZE / 2;
const R = 82;
const MAX = 100;
const RINGS = 4;

const AXES_LABELS: Record<keyof ZoneMarche["axes"], string> = {
  attractivite: "Attractivité",
  liquidite: "Liquidité",
  rendement: "Rendement",
  risque: "Risque",
  demande: "Demande",
  offre: "Offre",
};

const AXES_ORDER: Array<keyof ZoneMarche["axes"]> = [
  "attractivite",
  "liquidite",
  "rendement",
  "risque",
  "demande",
  "offre",
];

function vertex(i: number, n: number, f: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: C + R * f * Math.cos(angle), y: C + R * f * Math.sin(angle) };
}

function polygon(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function formatPrix(n: number): string {
  return n.toLocaleString("fr-FR") + " €";
}

function formatDelta(d: number): string {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

interface ZoneRadarProps {
  zone: ZoneMarche;
}

export function ZoneRadar({ zone }: ZoneRadarProps) {
  const n = AXES_ORDER.length;
  const shape = AXES_ORDER.map((key, i) =>
    vertex(i, n, Math.max(0, Math.min(1, zone.axes[key] / MAX)))
  );

  const tendanceLabel = TENDANCE_LABEL[zone.tendance];
  const tendanceTone = TENDANCE_TONE[zone.tendance];

  return (
    <div className="mkt-radar-wrap">
      {/* Titre zone */}
      <div className="mkt-radar-header">
        <h3 className="mkt-radar-zone-name">{zone.label}</h3>
        <p className="mkt-radar-zone-desc">{zone.description}</p>
      </div>

      {/* SVG radar */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mkt-radar-svg"
        role="img"
        aria-label={`Radar marché ${zone.label} : ${AXES_ORDER.map((k) => `${AXES_LABELS[k]} ${zone.axes[k]}%`).join(", ")}`}
      >
        {/* Anneaux */}
        {Array.from({ length: RINGS }, (_, r) => {
          const f = (r + 1) / RINGS;
          return (
            <polygon
              key={r}
              className="mkt-radar-grid"
              points={polygon(AXES_ORDER.map((_, i) => vertex(i, n, f)))}
            />
          );
        })}

        {/* Axes + labels */}
        {AXES_ORDER.map((key, i) => {
          const tip = vertex(i, n, 1);
          const labelV = vertex(i, n, 1.22);
          return (
            <g key={key}>
              <line className="mkt-radar-axis" x1={C} y1={C} x2={tip.x} y2={tip.y} />
              <text
                className="mkt-radar-axis-label"
                x={labelV.x}
                y={labelV.y}
                textAnchor={labelV.x < C - 4 ? "end" : labelV.x > C + 4 ? "start" : "middle"}
                dominantBaseline="middle"
              >
                {AXES_LABELS[key]}
              </text>
            </g>
          );
        })}

        {/* Forme zone */}
        <polygon className="mkt-radar-shape" points={polygon(shape)} />

        {/* Points aux sommets */}
        {shape.map((pt, i) => (
          <circle key={i} className="mkt-radar-dot" cx={pt.x} cy={pt.y} r="3" />
        ))}
      </svg>

      {/* KPI strip */}
      <div className="mkt-kpi-strip">
        <div className="mkt-kpi-item">
          <div className="mkt-kpi-val">{formatPrix(zone.prixM2)}/m²</div>
          <div className="mkt-kpi-lab">Prix moyen</div>
        </div>
        <div className="mkt-kpi-item">
          <div className={`mkt-kpi-val ${zone.delta12m >= 0 ? "is-positive" : "is-negative"}`}>
            {formatDelta(zone.delta12m)}
          </div>
          <div className="mkt-kpi-lab">12 mois</div>
        </div>
        <div className="mkt-kpi-item">
          <div className="mkt-kpi-val">{zone.nbOffres}</div>
          <div className="mkt-kpi-lab">Biens actifs</div>
        </div>
        <div className="mkt-kpi-item">
          <div className={`mkt-kpi-val ${tendanceTone}`}>{tendanceLabel}</div>
          <div className="mkt-kpi-lab">Tendance</div>
        </div>
      </div>

      {/* Détail appart / maison */}
      <div className="mkt-price-detail">
        <div className="mkt-price-row">
          <span className="mkt-price-type">Appartements</span>
          <span className="mkt-price-val">{formatPrix(zone.prixM2Appart)}/m²</span>
        </div>
        <div className="mkt-price-row">
          <span className="mkt-price-type">Maisons / villas</span>
          <span className="mkt-price-val">{formatPrix(zone.prixM2Maison)}/m²</span>
        </div>
      </div>
    </div>
  );
}
