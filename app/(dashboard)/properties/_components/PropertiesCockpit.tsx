"use client";

import Link from "next/link";
import { eur, dateFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { usePropertyLive } from "@/lib/hooks/usePropertyLive";

export type CockpitProperty = {
  id: string;
  status: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  asking_price: number | null;
  created_at?: string;
  updated_at?: string;
};

/** Statuts actifs / en cours de commercialisation. */
const ACTIVE = new Set(["en_vente", "sous_offre", "mandat", "estimation"]);
/** Statuts à compléter / prospect. */
const TO_COMPLETE = new Set(["prospect", "estimation"]);
/** Statuts terminés. */
const CLOSED = new Set(["vendu", "archive"]);

/** Tone CSS pour un statut bien. */
function statusToneProp(status: string): string {
  if (status === "en_vente" || status === "sous_offre") return "nominal";
  if (status === "mandat") return "nominal";
  if (status === "vendu") return "";
  if (status === "prospect" || status === "estimation") return "warn";
  return "";
}

function priceLabel(price: number | null): string {
  if (price == null || price === 0) return "—";
  return eur(price);
}

/** Zone compacte : titre + compteur + 3 items max + status badge. */
function Zone({
  label,
  count,
  properties,
  showStatus = false,
  showPrice = false,
  showDate = false,
  emptyLabel,
}: {
  label: string;
  count: number;
  properties: CockpitProperty[];
  showStatus?: boolean;
  showPrice?: boolean;
  showDate?: boolean;
  emptyLabel: string;
}) {
  const tp = UI.properties;
  return (
    <div className="lead-cockpit-zone">
      <div className="lead-cockpit-zone-head">
        <span className="ct-card-title">{label}</span>
        <span className="ct-badge is-muted">{count}</span>
      </div>
      {properties.length === 0 ? (
        <p className="ct-placeholder lead-cockpit-empty">{emptyLabel}</p>
      ) : (
        <ul className="lead-cockpit-list">
          {properties.slice(0, 3).map((p) => (
            <li key={p.id} className="lead-cockpit-item">
              <Link href={`/properties/${p.id}`} className="lead-cockpit-item-name">
                {p.title ?? tp.fallbackTitle}
              </Link>
              <span className="prop-cockpit-item-right">
                {showPrice && (
                  <span className="lead-cockpit-item-meta">{priceLabel(p.asking_price)}</span>
                )}
                {showDate && (
                  <span className="lead-cockpit-item-meta">{dateFr(p.created_at ?? null)}</span>
                )}
                {showStatus && (
                  <span className={`prop-status-badge ${statusToneProp(p.status)}`}>
                    {tp.statusLabels[p.status] ?? p.status}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bloc santé : signaux utiles (biens sans prix, sans ville). */
function HealthBlock({ properties }: { properties: CockpitProperty[] }) {
  const t = UI.properties.cockpit;
  const noPrix = properties.filter((p) => !p.asking_price || p.asking_price === 0).length;
  const noCity = properties.filter((p) => !p.city).length;
  const noType = properties.filter((p) => !p.property_type).length;

  const signals = [
    { label: t.healthNoPrix, count: noPrix, warn: noPrix > 0 },
    { label: t.healthNoCity, count: noCity, warn: noCity > 0 },
    { label: t.healthNoType, count: noType, warn: noType > 0 },
  ].filter((s) => s.count > 0);

  if (signals.length === 0) return null;

  return (
    <div className="lead-cockpit-zone prop-health-block">
      <div className="lead-cockpit-zone-head">
        <span className="ct-card-title">{t.healthTitle}</span>
      </div>
      <div className="prop-health-row">
        {signals.map((s) => (
          <span key={s.label} className={`prop-status-badge ${s.warn ? "warn" : ""}`}>
            {s.count} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Badge discret d'état live. */
function LiveBadge() {
  const { connected, lastEventAt, pendingRefresh } = usePropertyLive();
  const t = UI.properties.cockpit;
  if (!connected) return null;
  if (pendingRefresh) {
    return <span className="prop-live-badge is-refreshing" title={t.liveHint}>{t.liveRefreshing}</span>;
  }
  if (lastEventAt) {
    return <span className="prop-live-badge is-updated" title={t.liveHint}>{t.liveUpdated}</span>;
  }
  return <span className="prop-live-badge" title={t.liveHint}>{t.live}</span>;
}

/**
 * Vue COCKPIT portefeuille : zones métier + santé + activité récente.
 * Lecture seule, aucune action destructive exposée.
 */
export function PropertiesCockpit({ properties }: { properties: CockpitProperty[] }) {
  const t = UI.properties.cockpit;
  const tp = UI.properties;

  const byRecent = [...properties].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
  );
  const byCreated = [...properties].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );

  const active = byRecent.filter((p) => ACTIVE.has(p.status));
  const toComplete = byRecent.filter((p) => TO_COMPLETE.has(p.status));
  const recent = byCreated.slice(0, 5);
  const closed = byRecent.filter((p) => CLOSED.has(p.status));

  return (
    <div className="lead-cockpit">
      <div className="prop-live-row">
        <LiveBadge />
      </div>
      <div className="lead-cockpit-grid">
        <Zone
          label={t.active}
          count={active.length}
          properties={active}
          showPrice
          emptyLabel={t.zoneEmpty}
        />
        <Zone
          label={t.toComplete}
          count={toComplete.length}
          properties={toComplete}
          showStatus
          emptyLabel={t.zoneEmpty}
        />
        <Zone
          label={t.recent}
          count={recent.length}
          properties={recent}
          showDate
          emptyLabel={t.zoneEmpty}
        />
        <Zone
          label={t.closed}
          count={closed.length}
          properties={closed}
          showStatus
          emptyLabel={t.zoneEmpty}
        />
      </div>

      <HealthBlock properties={properties} />

      <div className="lead-cockpit-activity">
        <div className="ct-card-title">{t.recentActivity}</div>
        {byRecent.length === 0 ? (
          <p className="ct-placeholder">{t.zoneEmpty}</p>
        ) : (
          <ul className="lead-cockpit-activity-list">
            {byRecent.slice(0, 5).map((p) => (
              <li key={p.id} className="lead-cockpit-activity-item">
                <Link href={`/properties/${p.id}`} className="lead-cockpit-item-name">
                  {p.title ?? tp.fallbackTitle}
                </Link>
                <span className="prop-cockpit-item-right">
                  <span className={`prop-status-badge ${statusToneProp(p.status)}`}>
                    {tp.statusLabels[p.status] ?? p.status}
                  </span>
                  {p.city && (
                    <span className="lead-cockpit-item-meta">{p.city}</span>
                  )}
                  {p.updated_at && (
                    <span className="lead-cockpit-item-meta">{dateFr(p.updated_at)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="prop-cockpit-links">
        <Link href="/mandates" className="ct-seg-btn">
          {t.seeMandates}
        </Link>
        <Link href="/estimations" className="ct-seg-btn">
          {t.seeEstimations}
        </Link>
      </div>
    </div>
  );
}
