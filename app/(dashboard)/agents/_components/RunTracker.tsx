"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { Icon } from "@/components/cockpit/Icon";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AGENTS_ANCHORS } from "@/lib/onboarding/tours/agents";
import { blockDuringTour } from "@/lib/onboarding/tour-guard";
import type {
  RuntimeRun,
  RuntimeRunEvent,
  RuntimeRunStatus,
} from "@/lib/aigent/runtime-types";

const t = UI.agentsPage;

/** Intervalle de polling tant qu'un run est actif (ms). */
const POLL_MS = 2000;

/** Statuts terminaux : plus rien à poller. */
const TERMINAL: RuntimeRunStatus[] = ["completed", "failed", "cancelled"];

/** Couleur de badge par statut de run (sémantique). */
function runColor(status: RuntimeRunStatus): "lime" | "amber" | "red" | "zinc" {
  switch (status) {
    case "completed":
      return "lime";
    case "running":
    case "queued":
      return "amber";
    case "waiting_on_input":
      return "amber";
    case "failed":
      return "red";
    case "cancelled":
      return "zinc";
    default:
      return "zinc";
  }
}

type RunResponse =
  | { ok: true; data: RuntimeRun }
  | { ok: false; unavailable: { reason: string } }
  | { ok: false; notFound: true }
  | { error: string };

type EventsResponse =
  | { ok: true; data: RuntimeRunEvent[] }
  | { ok: false; unavailable: { reason: string } }
  | { ok: false; notFound: true }
  | { error: string };

/**
 * Suivi d'un run — état RÉEL, événements ordonnés, résultat sourcé et validation
 * HITL. Poll l'état + les événements à intervalle court tant que le run est
 * actif (non terminal). Ne fabrique aucun statut, événement ni résultat :
 * affiche exactement ce que le registre renvoie. Un run introuvable (404) est
 * signalé honnêtement (aucun run store branché à l'état actuel du registre).
 */
export function RunTracker({
  runId,
  onClose,
  tourActive,
}: {
  runId: string;
  onClose: () => void;
  /** LOT 10 — visite en cours : la décision HITL est expliquée, jamais envoyée. */
  tourActive: boolean;
}) {
  const [run, setRun] = useState<RuntimeRun | null>(null);
  const [events, setEvents] = useState<RuntimeRunEvent[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const cursorRef = useRef<number>(-1);

  const poll = useCallback(async () => {
    try {
      const [runRes, evtRes] = await Promise.all([
        fetch(`/api/aigent/runs/${encodeURIComponent(runId)}`, {
          headers: { accept: "application/json" },
        }),
        fetch(
          `/api/aigent/runs/${encodeURIComponent(runId)}/events?after=${cursorRef.current}`,
          { headers: { accept: "application/json" } },
        ),
      ]);

      const runJson = (await runRes.json().catch(() => null)) as RunResponse | null;
      if (runJson && "ok" in runJson && runJson.ok) {
        setRun(runJson.data);
        setPhase("ready");
      } else if (runJson && "ok" in runJson && !runJson.ok && "notFound" in runJson) {
        setPhase("notfound");
        return; // run inexistant → on arrête le poll
      } else {
        setPhase((p) => (p === "loading" ? "error" : p));
      }

      const evtJson = (await evtRes.json().catch(() => null)) as EventsResponse | null;
      if (evtJson && "ok" in evtJson && evtJson.ok && evtJson.data.length > 0) {
        setEvents((prev) => [...prev, ...evtJson.data]);
        const last = evtJson.data[evtJson.data.length - 1];
        if (typeof last.sequence === "number") cursorRef.current = last.sequence;
      }
    } catch {
      setPhase((p) => (p === "loading" ? "error" : p));
    }
  }, [runId]);

  // Poll tant que le run n'est pas terminal. Le composant est REMONTÉ par le
  // parent (`key={runId}`) à chaque nouveau run → l'état initial est déjà frais
  // (pas de reset synchrone dans l'effet, cf. react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await poll();
      if (cancelled) return;
      // Stoppe le polling une fois terminal — sinon reprogramme.
      setRun((current) => {
        if (!current || !TERMINAL.includes(current.status)) {
          timer = setTimeout(tick, POLL_MS);
        }
        return current;
      });
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [poll]);

  return (
    <div className="surface flex flex-col gap-4 p-5">
      {/* En-tête : titre + statut réel + fermer */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Strong className="text-base">{t.runsTitle}</Strong>
          {run ? <Badge color={runColor(run.status)}>{t.runStatus[run.status] ?? run.status}</Badge> : null}
        </div>
        <Button plain onClick={onClose} aria-label={t.close}>
          <Icon name="chevron-right" data-slot="icon" />
        </Button>
      </div>

      {phase === "loading" && (
        <div className="flex items-center gap-2 py-6">
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent"
          />
          <Text>{UI.common.loading}</Text>
        </div>
      )}

      {phase === "notfound" && <Text className="py-2">{t.runsEmpty}</Text>}
      {phase === "error" && (
        <Text className="py-2">
          <Badge color="red">{UI.common.error}</Badge>
        </Text>
      )}

      {phase === "ready" && run && (
        <>
          {/* Validation HITL — seule surface qui débloque une action à effet réel */}
          {run.status === "waiting_on_input" && (
            <HitlPanel runId={runId} onResolved={poll} tourActive={tourActive} />
          )}

          {/* Résultat sourcé (uniquement si terminé avec succès) */}
          {run.status === "completed" && <RunResult run={run} />}

          {/* Erreur structurée (uniquement si échoué) */}
          {run.status === "failed" && run.error ? (
            <div className="rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-3.5 py-2.5">
              <Text className="text-sm">{run.error.message}</Text>
            </div>
          ) : null}

          {/* Journal d'événements ordonnés */}
          <EventLog events={events} />
        </>
      )}
    </div>
  );
}

/** Panneau de décision humaine (HITL) : approuver / refuser. */
function HitlPanel({
  runId,
  onResolved,
  tourActive,
}: {
  runId: string;
  onResolved: () => void;
  tourActive: boolean;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  async function decide(action: "approve" | "reject") {
    if (blockDuringTour(tourActive, "agents-hitl-decision")) return;
    setBusy(action);
    setNote(null);
    try {
      const res = await fetch(`/api/aigent/runs/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; conflict?: true; notFound?: true }
        | { error: string }
        | null;
      if (json && "ok" in json && json.ok) {
        setNote({ tone: "ok", msg: t.decisionSent });
        onResolved();
        return;
      }
      if (json && "ok" in json && !json.ok && json.conflict) {
        setNote({ tone: "err", msg: t.notWaiting });
        return;
      }
      setNote({ tone: "err", msg: t.decisionFailed });
    } catch {
      setNote({ tone: "err", msg: t.decisionFailed });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-tour-id={AGENTS_ANCHORS.hitl}
      className="rounded-xl border border-accent-500/30 bg-accent-500/[0.06] p-4"
    >
      <Strong className="text-sm">{t.hitlTitle}</Strong>
      <Text className="mt-1 text-sm">{t.hitlBody}</Text>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          color="indigo"
          onClick={() => decide("approve")}
          disabled={busy !== null || tourActive}
        >
          {busy === "approve" ? t.deciding : t.approve}
        </Button>
        <Button
          color="light"
          onClick={() => decide("reject")}
          disabled={busy !== null || tourActive}
        >
          {busy === "reject" ? t.deciding : t.reject}
        </Button>
      </div>
      {note ? (
        <Text className="mt-2 text-xs">
          <Badge color={note.tone === "ok" ? "lime" : "red"}>{note.msg}</Badge>
        </Text>
      ) : null}
    </div>
  );
}

/** Résultat d'un run terminé — provenance + sources (jamais un résultat non sourcé). */
function RunResult({ run }: { run: RuntimeRun }) {
  // `output` est opaque au contrat générique. On rend un résumé texte s'il est
  // fourni sous une forme reconnaissable, sinon le JSON brut lisible — jamais un
  // champ inventé. Les sources, si présentes, sont affichées telles quelles.
  const output = run.output as
    | { summary?: string; sources?: { label?: string; ref?: string }[] }
    | undefined;
  const summary = typeof output?.summary === "string" ? output.summary : null;
  const sources = Array.isArray(output?.sources) ? output.sources : [];

  return (
    <div className="rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-4">
      <Strong className="text-sm">{t.resultTitle}</Strong>
      {summary ? (
        <Text className="mt-1.5 text-sm">{summary}</Text>
      ) : output !== undefined ? (
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-zinc-950/[0.03] p-3 text-xs text-zinc-700">
          {JSON.stringify(run.output, null, 2)}
        </pre>
      ) : null}

      <div className="mt-3">
        <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          {t.sourcesLabel}
        </span>
        {sources.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {sources.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5 text-sm text-zinc-700">
                <span aria-hidden className="text-zinc-400">
                  •
                </span>
                {s.label ?? s.ref ?? "—"}
              </li>
            ))}
          </ul>
        ) : (
          <Text className="mt-1 text-xs">{t.noSources}</Text>
        )}
      </div>
    </div>
  );
}

/** Journal d'événements ordonnés (opaques). Affiche type + horodatage. */
function EventLog({ events }: { events: RuntimeRunEvent[] }) {
  return (
    <div>
      <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {t.eventsTitle}
      </span>
      {events.length === 0 ? (
        <Text className="mt-1.5 text-xs">{t.eventsEmpty}</Text>
      ) : (
        <ul className="mt-1.5 flex flex-col divide-y divide-zinc-950/5">
          {events.map((e) => (
            <li key={e.sequence} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm text-zinc-700">{e.type}</span>
              {e.at ? <span className="text-xs text-zinc-400 tabular-nums">{e.at}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
