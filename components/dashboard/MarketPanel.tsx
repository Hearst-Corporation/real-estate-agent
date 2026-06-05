"use client";

/**
 * MarketPanel — Panneau client : carte choroplèthe + radar de zone.
 * Gère le state `selectedZoneId` partagé entre MarketMap et ZoneRadar.
 * Reçoit les données ZONES_MARCHE sérialisées depuis le RSC parent.
 */

import { useState } from "react";
import { MarketMap } from "./MarketMap";
import { ZoneRadar } from "./ZoneRadar";
import type { ZoneMarche } from "@/lib/market/zones";

interface MarketPanelProps {
  zones: ZoneMarche[];
  defaultZoneId?: string;
}

export function MarketPanel({ zones, defaultZoneId }: MarketPanelProps) {
  const [selectedId, setSelectedId] = useState(defaultZoneId ?? zones[1]?.id ?? zones[0]?.id ?? "");

  const selectedZone = zones.find((z) => z.id === selectedId) ?? zones[0];
  if (!selectedZone) return null;

  return (
    <div className="mkt-panel">
      <div className="mkt-panel-map">
        <MarketMap zones={zones} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="mkt-panel-radar">
        <ZoneRadar zone={selectedZone} />
      </div>
    </div>
  );
}
