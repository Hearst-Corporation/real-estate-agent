"use client";

// components/timeline/Timeline.tsx — Flux chronologique unifié d'une entité.
//
// Rend les événements agrégés (visites, estimations, messages, mandats, envois,
// contacts) via /api/timeline. États loading / empty / error explicites. Chaque
// événement vient d'une ligne DB réelle : aucune donnée → empty honnête.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarIcon,
  DocumentChartBarIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  PhoneArrowUpRightIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/20/solid";
import { relativeFr } from "@/lib/timeline/relative";
import type { TimelineEvent, TimelineKind } from "@/lib/timeline/types";

type Props = {
  type: "lead" | "property";
  id: string;
  limit?: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: TimelineEvent[] };

const KIND_META: Record<
  TimelineKind,
  { icon: typeof CalendarIcon; label: string }
> = {
  visit: { icon: CalendarIcon, label: "Visite" },
  estimation: { icon: DocumentChartBarIcon, label: "Estimation" },
  estimation_message: { icon: ChatBubbleLeftRightIcon, label: "Message" },
  mandate: { icon: DocumentTextIcon, label: "Mandat" },
  prosp_envoi: { icon: PaperAirplaneIcon, label: "Envoi" },
  contact_attempt: { icon: PhoneArrowUpRightIcon, label: "Contact" },
  share_open: { icon: EyeIcon, label: "Lien consulté" },
  share_feedback: { icon: ChatBubbleLeftRightIcon, label: "Retour partage" },
};

function EventRow({ event }: { event: TimelineEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const title = event.entityRef.href ? (
    <Link
      href={event.entityRef.href}
      className="rounded-sm font-medium text-zinc-950 hover:text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-zinc-100 dark:hover:text-accent-400"
    >
      {event.title}
    </Link>
  ) : (
    <span className="font-medium text-zinc-950 dark:text-zinc-100">{event.title}</span>
  );

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Trait vertical de connexion */}
      <span
        aria-hidden="true"
        className="absolute top-8 left-4 -ml-px h-full w-px bg-zinc-950/10 dark:bg-white/10"
      />
      <span className="relative flex size-8 flex-none items-center justify-center rounded-full bg-accent-100 ring-1 ring-accent-600/20 dark:bg-accent-900/30 dark:ring-accent-400/20">
        <Icon className="size-4 text-accent-700 dark:text-accent-400" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {title}
          {event.status ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">· {event.status}</span>
          ) : null}
          <time
            dateTime={event.ts}
            title={new Date(event.ts).toLocaleString("fr-FR")}
            className="ml-auto text-xs whitespace-nowrap text-zinc-400 dark:text-zinc-500"
          >
            {relativeFr(event.ts)}
          </time>
        </div>
        {event.summary ? (
          <p className="mt-0.5 line-clamp-2 text-sm break-words text-zinc-600 dark:text-zinc-400">
            {event.summary}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Wrapper : remonte TimelineInner via `key` à chaque changement d'entrée ou de
 * reload → l'état initial est toujours frais, sans reset synchrone dans l'effet
 * (cf. react-hooks/set-state-in-effect).
 */
export function Timeline({ type, id, limit = 100 }: Props) {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <TimelineInner
      key={`${type}:${id}:${limit}:${reloadKey}`}
      type={type}
      id={id}
      limit={limit}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}

function TimelineInner({
  type,
  id,
  limit,
  onReload,
}: Required<Props> & { onReload: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ type, id, limit: String(limit) });
    fetch(`/api/timeline?${params.toString()}`, { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { items?: TimelineEvent[] };
        if (!cancelled) setState({ status: "ready", items: json.items ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [type, id, limit]);

  if (state.status === "loading") {
    return (
      <ul className="animate-pulse" aria-busy="true" aria-label="Chargement de la timeline">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-4 pb-6">
            <span className="size-8 flex-none rounded-full bg-zinc-950/5 dark:bg-white/10" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-1/3 rounded bg-zinc-950/5 dark:bg-white/10" />
              <div className="h-3 w-2/3 rounded bg-zinc-950/5 dark:bg-white/10" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-950/10 bg-zinc-50 px-4 py-6 dark:border-white/10 dark:bg-white/5">
        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <ExclamationTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          Impossible de charger l&apos;historique.
        </p>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-950/15 px-4 py-8 text-center dark:border-white/15">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Aucun événement pour le moment.
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Visites, estimations, mandats et contacts apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <ul >
      {state.items.map((event) => (
        <EventRow key={`${event.entityRef.table}:${event.entityRef.id}`} event={event} />
      ))}
    </ul>
  );
}

export default Timeline;
