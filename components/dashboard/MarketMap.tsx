"use client";

/**
 * MarketMap — Carte choroplèthe SVG des zones Antibes / Juan-les-Pins / Vieille Antibes.
 * Polygones colorés selon prix/m² (dégradé accent → fond). Hover = tooltip, click = select.
 * Aucune dépendance externe (Mapbox, Leaflet, etc.) — SVG inline pur.
 */

import { normalisePrix, TENDANCE_LABEL, type ZoneMarche } from "@/lib/market/zones";

interface MarketMapProps {
  zones: ZoneMarche[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Polygones SVG approximant les 3 zones d'Antibes (représentation schématique).
 * Viewbox 400×320. Nord en haut, mer en bas.
 *
 * Antibes Centre : bloc intérieur centre-gauche
 * Juan-les-Pins  : presqu'île à droite (mer sur 3 côtés)
 * Vieille Antibes : cap nord-est (pointe du cap d'Antibes côté Golfe Juan)
 */
const ZONE_PATHS: Record<string, string> = {
  "antibes-centre":
    "M 60 60 L 180 55 L 195 130 L 175 175 L 90 175 L 60 145 Z",
  "juan-les-pins":
    "M 195 130 L 310 110 L 340 160 L 310 230 L 230 250 L 195 200 L 175 175 Z",
  "vieille-antibes":
    "M 60 60 L 180 55 L 195 130 L 175 175 L 90 175 L 60 145 L 40 110 L 40 60 Z",
};

/** Zone "mer" décorative en bas */
const MER_PATH = "M 0 260 Q 100 240 200 255 Q 300 270 400 255 L 400 320 L 0 320 Z";

/** Littoral décoratif */
const COTE_PATH = "M 0 260 Q 100 240 200 255 Q 300 270 400 255";

// Interpolation hex entre bordeaux (#7c1a29) et fond foncé (#1a1015) selon prix
function accentOpacity(normalised: number): number {
  // Plus le prix est élevé, plus la teinte accent est forte
  return 0.18 + normalised * 0.55;
}

function formatPrix(n: number): string {
  return n.toLocaleString("fr-FR") + " €/m²";
}

function formatDelta(d: number): string {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

export function MarketMap({ zones, selectedId, onSelect }: MarketMapProps) {
  return (
    <div className="mkt-map-wrap">
      <svg
        viewBox="0 0 400 290"
        className="mkt-map-svg"
        role="img"
        aria-label="Carte des zones immobilières d'Antibes"
      >
        {/* Fond mer */}
        <path d={MER_PATH} className="mkt-map-mer" />
        <path d={COTE_PATH} className="mkt-map-cote" />

        {/* Zones */}
        {zones.map((zone) => {
          const norm = normalisePrix(zone.prixM2);
          const opacity = accentOpacity(norm);
          const isSelected = zone.id === selectedId;
          const path = ZONE_PATHS[zone.id];
          if (!path) return null;
          return (
            <g key={zone.id}>
              <path
                d={path}
                className={`mkt-map-zone${isSelected ? " selected" : ""}`}
                style={{ "--zone-opacity": opacity } as React.CSSProperties}
                onClick={() => onSelect(zone.id)}
                role="button"
                aria-label={`${zone.label} — ${formatPrix(zone.prixM2)}`}
                aria-pressed={isSelected}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(zone.id); }}
              />
              {/* Label centroïde (approximatif) */}
              <text
                className={`mkt-map-label${isSelected ? " selected" : ""}`}
                x={zone.id === "antibes-centre" ? 115 : zone.id === "juan-les-pins" ? 255 : 92}
                y={zone.id === "antibes-centre" ? 115 : zone.id === "juan-les-pins" ? 185 : 100}
                textAnchor="middle"
              >
                {zone.label}
              </text>
              <text
                className="mkt-map-prix"
                x={zone.id === "antibes-centre" ? 115 : zone.id === "juan-les-pins" ? 255 : 92}
                y={zone.id === "antibes-centre" ? 130 : zone.id === "juan-les-pins" ? 200 : 115}
                textAnchor="middle"
              >
                {formatPrix(zone.prixM2)}
              </text>
              <text
                className={`mkt-map-delta ${zone.delta12m >= 0 ? "positive" : "negative"}`}
                x={zone.id === "antibes-centre" ? 115 : zone.id === "juan-les-pins" ? 255 : 92}
                y={zone.id === "antibes-centre" ? 145 : zone.id === "juan-les-pins" ? 215 : 130}
                textAnchor="middle"
              >
                {formatDelta(zone.delta12m)} / 12 mois
              </text>
            </g>
          );
        })}

        {/* Boussole décorative */}
        <g transform="translate(368, 22)">
          <circle r="14" className="mkt-map-compass-bg" />
          <text className="mkt-map-compass-n" x="0" y="4" textAnchor="middle">N</text>
        </g>

        {/* Légende prix */}
        <g transform="translate(12, 262)">
          <text className="mkt-map-legend-title" x="0" y="0">Prix</text>
          <rect x="0" y="6" width="60" height="6" className="mkt-map-legend-low" rx="2" />
          <text className="mkt-map-legend-val" x="0" y="20">bas</text>
          <text className="mkt-map-legend-val" x="55" y="20" textAnchor="end">élevé</text>
        </g>
      </svg>

      {/* Légende tendances sous la carte */}
      <div className="mkt-map-footer">
        {zones.map((z) => (
          <button
            key={z.id}
            className={`mkt-zone-chip${z.id === selectedId ? " selected" : ""}`}
            onClick={() => onSelect(z.id)}
            type="button"
          >
            <span className="mkt-zone-chip-dot" />
            <span>{z.label}</span>
            <span className="mkt-zone-chip-trend">{TENDANCE_LABEL[z.tendance]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
