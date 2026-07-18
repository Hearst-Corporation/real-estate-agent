"use client";

import { useEffect, useState } from "react";
import {
  ArrowTrendingDownIcon,
  ClockIcon,
  CalendarDaysIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eur, dateFr } from "@/lib/crm/format";
import type {
  PriceDropSignal,
  DormantSignal,
  MandateExpirySignal,
} from "@/lib/radar/signals";
import type { RadarResponse, RadarSection } from "@/app/api/radar/route";
import { RADAR_ANCHORS } from "@/lib/onboarding/tours/radar";

// ─── Chargement ────────────────────────────────────────────────────────────────

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: RadarResponse };

function totalSignals(d: RadarResponse): number {
  return d.price_drops.items.length + d.dormant.items.length + d.mandate_expiries.items.length;
}

// ─── Tonalité d'urgence (accent or / zinc uniquement) ───────────────────────────

/** Badge de jours restants pour un mandat : plus c'est proche, plus c'est accentué. */
function expiryBadge(jours: number): { color: "amber" | "zinc"; label: string } {
  if (jours < 0) return { color: "amber", label: `Expiré (${Math.abs(jours)} j)` };
  if (jours <= 7) return { color: "amber", label: `${jours} j` };
  return { color: "zinc", label: `${jours} j` };
}

// ─── Sections ───────────────────────────────────────────────────────────────────

function SectionShell({
  icon: Icon,
  title,
  count,
  tourId,
  children,
}: {
  icon: typeof ClockIcon;
  title: string;
  count: number | null;
  /** Ancre de visite guidée (`data-tour-id`) portée par la vraie section. */
  tourId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-tour-id={tourId} className="surface rounded-xl p-4 sm:p-6">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400">
          <Icon className="size-5" aria-hidden />
        </span>
        <Subheading className="flex-1">{title}</Subheading>
        {count != null && count > 0 && <Badge color="amber">{count}</Badge>}
      </header>
      {children}
    </section>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-950/10 p-4 dark:border-white/10">
      <Text className="text-zinc-500 dark:text-zinc-400">
        {label} — données indisponibles (schéma absent sur cette base).
      </Text>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-950/10 p-6 text-center dark:border-white/10">
      <Text className="text-zinc-500 dark:text-zinc-400">{label}</Text>
    </div>
  );
}

/** Ligne dense générique : titre + sous-ligne + métrique chiffrée + action. */
function SignalRow({
  title,
  subtitle,
  metric,
  metricSub,
  action,
}: {
  title: string;
  subtitle: string | null;
  metric: React.ReactNode;
  metricSub?: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-950/5 py-3 first:border-t-0 dark:border-white/5">
      <div className="min-w-0 flex-1">
        <Text className="truncate font-medium text-zinc-950 dark:text-white">{title}</Text>
        {subtitle && (
          <Text className="truncate text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</Text>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular-nums font-semibold text-zinc-950 dark:text-white">{metric}</div>
        {metricSub && (
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">{metricSub}</Text>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function LinkAction({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Button href={href} target="_blank" rel="noreferrer" plain aria-label={label}>
      <ArrowTopRightOnSquareIcon />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

function PriceDropList({ section }: { section: RadarSection<PriceDropSignal> }) {
  if (section.status === "unavailable") return <Unavailable label="Baisses de prix" />;
  if (section.items.length === 0) return <Empty label="Aucune baisse de prix détectée." />;
  return (
    <ul>
      {section.items.map((s) => (
        <SignalRow
          key={s.annonce_id}
          title={s.titre ?? "Annonce sans titre"}
          subtitle={[s.ville, `${eur(s.prix_precedent)} → ${eur(s.prix_actuel)}`]
            .filter(Boolean)
            .join(" · ")}
          metric={<span className="text-accent-600 dark:text-accent-400">−{eur(s.drop_eur)}</span>}
          metricSub={`−${s.drop_pct.toFixed(1)} % · ${dateFr(s.observed_at)}`}
          action={<LinkAction href={s.url} label="Voir l'annonce" />}
        />
      ))}
    </ul>
  );
}

function DormantList({ section }: { section: RadarSection<DormantSignal> }) {
  if (section.status === "unavailable") return <Unavailable label="Annonces dormantes" />;
  if (section.items.length === 0) return <Empty label="Aucune annonce dormante." />;
  return (
    <ul>
      {section.items.map((s) => (
        <SignalRow
          key={s.annonce_id}
          title={s.titre ?? "Annonce sans titre"}
          subtitle={[s.ville, s.prix != null ? eur(s.prix) : null].filter(Boolean).join(" · ") || null}
          metric={`${s.jours_dormant} j`}
          metricSub={`sans MAJ depuis ${dateFr(s.since)}`}
          action={<LinkAction href={s.url} label="Voir l'annonce" />}
        />
      ))}
    </ul>
  );
}

function MandateList({ section }: { section: RadarSection<MandateExpirySignal> }) {
  if (section.status === "unavailable") return <Unavailable label="Mandats expirants" />;
  if (section.items.length === 0) return <Empty label="Aucun mandat n'arrive à échéance." />;
  return (
    <ul>
      {section.items.map((s) => {
        const b = expiryBadge(s.jours_restants);
        return (
          <SignalRow
            key={s.mandate_id}
            title={s.reference ?? `Mandat ${s.kind_label}`}
            subtitle={[s.kind_label, s.asking_price != null ? eur(s.asking_price) : null]
              .filter(Boolean)
              .join(" · ") || null}
            metric={<Badge color={b.color}>{b.label}</Badge>}
            metricSub={`échéance ${dateFr(s.expires_at)}`}
            action={
              <Button href="/mandates" plain aria-label="Voir les mandats">
                <ArrowTopRightOnSquareIcon />
                <span className="max-sm:sr-only">Ouvrir</span>
              </Button>
            }
          />
        );
      })}
    </ul>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  async function fetchRadar(): Promise<LoadState> {
    try {
      const res = await fetch("/api/radar", { cache: "no-store" });
      if (!res.ok) return { phase: "error" };
      const data = (await res.json()) as RadarResponse;
      return { phase: "ready", data };
    } catch {
      return { phase: "error" };
    }
  }

  function refresh() {
    setState({ phase: "loading" });
    void fetchRadar().then(setState);
  }

  useEffect(() => {
    let alive = true;
    void fetchRadar().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Radar vendeurs</Heading>
          <Text className="mt-1 text-zinc-500 dark:text-zinc-400">
            Signaux d&apos;opportunité en temps réel : baisses de prix, annonces dormantes, mandats à
            renouveler.
          </Text>
        </div>
        <Button
          plain
          onClick={() => refresh()}
          disabled={state.phase === "loading"}
          aria-label="Rafraîchir"
        >
          <ArrowPathIcon className={state.phase === "loading" ? "animate-spin" : undefined} />
          Rafraîchir
        </Button>
      </header>

      {state.phase === "loading" && (
        <div className="flex flex-col gap-6" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface h-40 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <div className="surface flex flex-col items-start gap-3 rounded-xl p-6">
          <Text className="text-zinc-950 dark:text-white">
            <Strong>Impossible de charger le radar.</Strong>
          </Text>
          <Text className="text-zinc-500 dark:text-zinc-400">
            Vérifie ta connexion ou réessaie dans un instant.
          </Text>
          <Button color="indigo" onClick={() => refresh()}>
            Réessayer
          </Button>
        </div>
      )}

      {state.phase === "ready" && (
        <>
          {totalSignals(state.data) === 0 && (
            <div className="surface rounded-xl p-6">
              <Text className="text-zinc-500 dark:text-zinc-400">
                Aucun signal actif pour le moment. Le radar remontera automatiquement les prochaines
                baisses de prix, annonces dormantes et mandats à échéance.
              </Text>
            </div>
          )}

          <SectionShell
            icon={ArrowTrendingDownIcon}
            title="Baisses de prix"
            tourId={RADAR_ANCHORS.priceDrops}
            count={state.data.price_drops.status === "ok" ? state.data.price_drops.items.length : null}
          >
            <PriceDropList section={state.data.price_drops} />
          </SectionShell>

          <SectionShell
            icon={ClockIcon}
            title="Annonces dormantes"
            tourId={RADAR_ANCHORS.dormant}
            count={state.data.dormant.status === "ok" ? state.data.dormant.items.length : null}
          >
            <DormantList section={state.data.dormant} />
          </SectionShell>

          <SectionShell
            icon={CalendarDaysIcon}
            title="Mandats expirants"
            tourId={RADAR_ANCHORS.mandates}
            count={
              state.data.mandate_expiries.status === "ok"
                ? state.data.mandate_expiries.items.length
                : null
            }
          >
            <MandateList section={state.data.mandate_expiries} />
          </SectionShell>
        </>
      )}
    </div>
  );
}
