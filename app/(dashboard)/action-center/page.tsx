"use client";

/**
 * Page « Centre d'actions » (W1) — vue priorisée UNIQUE.
 *
 * Agrège urgences, relances, visites, mandats expirants, approbations en attente
 * et opportunités marché (radar), chacune SCORÉE de façon déterministe et
 * EXPLICABLE. Chaque carte ouvre une VRAIE entité (href réel) et propose une
 * prochaine action réelle. Distingue LIVE / UNAVAILABLE par source (vérité honnête).
 *
 * Palette : accent (or) + zinc uniquement. États loading / empty / error / success,
 * focus clavier visible, responsive 390→1440, zéro scroll horizontal.
 */

import { useEffect, useState } from "react";
import { ArrowPathIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { UI } from "@/lib/ui-strings";
import { timeFr } from "@/lib/crm/format";
import { AC, FACTOR_LABEL } from "@/lib/action-center/labels";
import type { DailyCenterResponse, ScoredAction, SourceStatus } from "@/lib/action-center/types";

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: DailyCenterResponse };

// ─── Petits composants ────────────────────────────────────────────────────────

/** Pastille de disponibilité d'une source (LIVE / UNAVAILABLE — vérité honnête). */
function SourceBadge({ label, status }: { label: string; status: SourceStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
      <span
        aria-hidden
        className={
          status === "live"
            ? "size-1.5 rounded-full bg-accent-500"
            : "size-1.5 rounded-full bg-zinc-300"
        }
      />
      {label}
      <span className="text-zinc-400">
        · {status === "live" ? AC.status.live : AC.status.unavailable}
      </span>
    </span>
  );
}

/** Barre de score compacte (0..100) — accent or, tabulaire. */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-950/5"
        role="img"
        aria-label={`${AC.scoreLabel} ${score}`}
      >
        <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-semibold tabular-nums text-accent-700">
        {score}
      </span>
    </div>
  );
}

/** Ventilation lisible du score (les facteurs nommés qui l'ont fait monter). */
function ScoreWhy({ item }: { item: ScoredAction }) {
  const parts = item.explanation
    .filter((c) => c.points > 0)
    .map((c) => `${FACTOR_LABEL[c.factor]} +${c.points}`);
  if (parts.length === 0) return null;
  return (
    <Text className="mt-1 truncate text-xs text-zinc-400">
      <span className="text-zinc-500">{AC.whyLabel} :</span> {parts.join(" · ")}
    </Text>
  );
}

/** Libellé de la prochaine action réelle proposée (dérivé des quick actions). */
function nextActionLabel(item: ScoredAction): string {
  const q = UI.dashboard.center.quick;
  const hasValidate = item.quick.some((a) => a.kind === "validate");
  const hasCall = item.quick.some((a) => a.kind === "call");
  if (hasValidate) return q.validate;
  if (hasCall) return q.call;
  return q.open;
}

/** Carte d'action scorée — titre, raison, score expliqué, ouverture entité réelle. */
function ActionCard({ item }: { item: ScoredAction }) {
  return (
    <li>
      <Link
        href={item.href}
        className="group flex items-center gap-4 rounded-xl border border-zinc-950/8 bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-accent-500/40 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text className="truncate font-medium text-zinc-950">{item.title}</Text>
            {item.priority === "haute" && (
              <Badge color="amber" className="shrink-0">
                {UI.dashboard.center.groups[item.category] ?? item.category}
              </Badge>
            )}
          </div>
          <Text className="truncate text-sm text-zinc-500">{item.reason}</Text>
          <ScoreWhy item={item} />
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 @sm:flex">
          <ScoreBar score={item.score} />
          <span className="text-xs font-medium text-accent-700 opacity-0 transition-opacity group-hover:opacity-100">
            {nextActionLabel(item)}
          </span>
        </div>
        <ChevronRightIcon
          className="size-5 shrink-0 text-zinc-300 transition-colors group-hover:text-accent-600"
          aria-hidden
        />
      </Link>
    </li>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ActionCenterPage() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  async function load(): Promise<LoadState> {
    try {
      const res = await fetch("/api/action-center", { cache: "no-store" });
      if (!res.ok) return { phase: "error" };
      const data = (await res.json()) as DailyCenterResponse;
      return { phase: "ready", data };
    } catch {
      return { phase: "error" };
    }
  }

  function refresh() {
    setState({ phase: "loading" });
    void load().then(setState);
  }

  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const total = state.phase === "ready" ? state.data.total : 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 @container">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-600">
            <span aria-hidden className="h-px w-6 bg-accent-500/70" />
            {AC.eyebrow}
          </p>
          <Heading className="mt-2">{AC.title}</Heading>
          <Text className="mt-1 text-zinc-500">{AC.subtitle(total)}</Text>
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

      {/* Statut des sources — vérité LIVE / UNAVAILABLE par origine de donnée. */}
      {state.phase === "ready" && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-zinc-950/8 bg-white px-4 py-3">
          <SourceBadge label={AC.sources.core} status={state.data.sources.core} />
          <SourceBadge label={AC.sources.radar} status={state.data.sources.radar} />
          <SourceBadge label={AC.sources.approvals} status={state.data.sources.approvals} />
          <span className="ml-auto text-xs text-zinc-400">
            {AC.computedAt(timeFr(state.data.computedAt))}
          </span>
        </div>
      )}

      {state.phase === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl bg-zinc-950/5" />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <div className="surface flex flex-col items-start gap-3 rounded-xl p-6">
          <Text className="text-zinc-950">
            <Strong>Impossible de charger le centre d&apos;actions.</Strong>
          </Text>
          <Text className="text-zinc-500">Réessaie dans un instant.</Text>
          <Button color="indigo" onClick={() => refresh()}>
            Réessayer
          </Button>
        </div>
      )}

      {state.phase === "ready" && state.data.items.length === 0 && (
        <div className="surface flex flex-col items-center gap-3 rounded-xl px-6 py-12 text-center">
          <Text className="font-medium text-zinc-950">{AC.empty}</Text>
          <Text className="text-zinc-500">{AC.emptyHint}</Text>
        </div>
      )}

      {state.phase === "ready" && state.data.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.data.items.map((item) => (
            <ActionCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
