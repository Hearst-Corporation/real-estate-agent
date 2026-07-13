"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
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

/** Couleur de Badge (état) selon la tonalité métier du bien. */
function statusColorProp(status: string): "lime" | "amber" | "zinc" {
  if (status === "en_vente" || status === "sous_offre" || status === "mandat") {
    return "lime";
  }
  if (status === "prospect" || status === "estimation") {
    return "amber";
  }
  return "zinc";
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
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <Badge color="zinc">{count}</Badge>
      </div>
      {properties.length === 0 ? (
        <Text className="py-2 text-xs">{emptyLabel}</Text>
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
                  <Badge color={statusColorProp(p.status)}>
                    {tp.statusLabels[p.status] ?? p.status}
                  </Badge>
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
    { label: t.healthNoPrix, count: noPrix },
    { label: t.healthNoCity, count: noCity },
    { label: t.healthNoType, count: noType },
  ].filter((s) => s.count > 0);

  if (signals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.healthTitle}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {signals.map((s) => (
          <Badge key={s.label} color="amber">
            {s.count} {s.label}
          </Badge>
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
    return <Badge color="indigo" title={t.liveHint}>{t.liveRefreshing}</Badge>;
  }
  if (lastEventAt) {
    return <Badge color="lime" title={t.liveHint}>{t.liveUpdated}</Badge>;
  }
  return <Badge color="zinc" title={t.liveHint}>{t.live}</Badge>;
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

      <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t.recentActivity}
        </div>
        {byRecent.length === 0 ? (
          <Text className="py-2 text-xs">{t.zoneEmpty}</Text>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-950/5 dark:divide-white/5">
            {byRecent.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <Link
                  href={`/properties/${p.id}`}
                  className="truncate text-sm text-slate-200 hover:text-indigo-300"
                >
                  {p.title ?? tp.fallbackTitle}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge color={statusColorProp(p.status)}>
                    {tp.statusLabels[p.status] ?? p.status}
                  </Badge>
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
        <Button outline href="/mandates">
          {t.seeMandates}
        </Button>
        <Button outline href="/estimations">
          {t.seeEstimations}
        </Button>
      </div>
    </div>
  );
}
