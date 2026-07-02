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

/** Classes Tailwind du badge de statut selon la tonalité métier du bien. */
function statusToneProp(status: string): string {
  if (status === "en_vente" || status === "sous_offre" || status === "mandat") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "prospect" || status === "estimation") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }
  return "border-white/10 bg-white/[0.06] text-slate-300";
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
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-300">
          {count}
        </span>
      </div>
      {properties.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {properties.slice(0, 3).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/properties/${p.id}`}
                className="truncate text-sm text-slate-200 hover:text-indigo-300"
              >
                {p.title ?? tp.fallbackTitle}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5">
                {showPrice && (
                  <span className="text-xs text-slate-500">{priceLabel(p.asking_price)}</span>
                )}
                {showDate && (
                  <span className="text-xs text-slate-500">{dateFr(p.created_at ?? null)}</span>
                )}
                {showStatus && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusToneProp(p.status)}`}
                  >
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
    <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-4">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.healthTitle}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {signals.map((s) => (
          <span
            key={s.label}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              s.warn
                ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-white/[0.06] text-slate-300"
            }`}
          >
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
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium";
  if (pendingRefresh) {
    return (
      <span className={`${base} border-indigo-400/30 bg-indigo-500/10 text-indigo-300`} title={t.liveHint}>
        {t.liveRefreshing}
      </span>
    );
  }
  if (lastEventAt) {
    return (
      <span className={`${base} border-emerald-400/30 bg-emerald-500/10 text-emerald-300`} title={t.liveHint}>
        {t.liveUpdated}
      </span>
    );
  }
  return (
    <span className={`${base} border-white/10 bg-white/[0.06] text-slate-400`} title={t.liveHint}>
      {t.live}
    </span>
  );
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <LiveBadge />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t.recentActivity}
        </div>
        {byRecent.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">{t.zoneEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {byRecent.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <Link
                  href={`/properties/${p.id}`}
                  className="truncate text-sm text-slate-200 hover:text-indigo-300"
                >
                  {p.title ?? tp.fallbackTitle}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusToneProp(p.status)}`}
                  >
                    {tp.statusLabels[p.status] ?? p.status}
                  </span>
                  {p.city && (
                    <span className="text-xs text-slate-500">{p.city}</span>
                  )}
                  {p.updated_at && (
                    <span className="text-xs text-slate-500">{dateFr(p.updated_at)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/mandates"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          {t.seeMandates}
        </Link>
        <Link
          href="/estimations"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          {t.seeEstimations}
        </Link>
      </div>
    </div>
  );
}
