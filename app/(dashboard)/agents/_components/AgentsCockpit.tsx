"use client";

import { useCallback, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { Icon } from "@/components/cockpit/Icon";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTourActive } from "@/components/onboarding";
import { AGENTS_ANCHORS } from "@/lib/onboarding/tours/agents";
import type {
  PublishedAgent,
  PublishedAgentStatus,
  RuntimeUnavailableReason,
} from "@/lib/aigent/runtime-types";
import { AgentCard } from "./AgentCard";
import { RunTracker } from "./RunTracker";

const t = UI.agentsPage;

/** État initial calculé côté serveur (une seule requête, pas de flash). */
export type AgentsInitial =
  | { kind: "loaded"; agents: PublishedAgent[] }
  | { kind: "unavailable"; reason: RuntimeUnavailableReason }
  | { kind: "error" };

type View =
  | { kind: "loaded"; agents: PublishedAgent[] }
  | { kind: "unavailable"; reason: RuntimeUnavailableReason }
  | { kind: "error" };

/** Réponse uniforme des routes proxy `/api/aigent/**`. */
type ProxyResponse<T> =
  | { ok: true; data: T }
  | { ok: false; unavailable: { reason: RuntimeUnavailableReason } }
  | { ok: false; notFound: true }
  | { error: string };

/** Un statut d'agent est exécutable seulement en production (contrat §5). */
function isRunnable(status: PublishedAgentStatus): boolean {
  return status === "production";
}

/**
 * Cockpit d'exploitation des agents (client). Registry-driven : rend l'état réel
 * (chargé / vide / non connecté / erreur) et se remplit automatiquement dès que
 * le registre renvoie de vrais agents. NE fabrique aucun agent, run ou résultat.
 *
 * Un seul run « actif » est suivi à la fois (celui lancé/sélectionné) via
 * <RunTracker>, qui poll son état + événements et gère la validation HITL.
 */
export function AgentsCockpit({ initial }: { initial: AgentsInitial }) {
  const [view, setView] = useState<View>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // LOT 10 — aucun run ne peut être lancé pendant une visite guidée.
  const tourActive = useTourActive();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/aigent/agents", { headers: { accept: "application/json" } });
      const raw: unknown = await res.json().catch(() => null);
      const json = raw as ProxyResponse<PublishedAgent[]> | null;
      if (json && "ok" in json && json.ok) {
        setView({ kind: "loaded", agents: json.data });
      } else if (json && "ok" in json && !json.ok && "unavailable" in json) {
        setView({ kind: "unavailable", reason: json.unavailable.reason });
      } else {
        setView({ kind: "error" });
      }
    } catch {
      setView({ kind: "error" });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const agents = view.kind === "loaded" ? view.agents : [];
  const runnableCount = agents.filter((a) => isRunnable(a.status)).length;
  const connected = view.kind === "loaded";

  return (
    <div className="flex flex-col gap-8 pb-12">
      <Header
        connected={connected}
        published={connected ? agents.length : null}
        runnable={connected ? runnableCount : null}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {tourActive && (
        <p role="status" className="surface border-l-4 border-accent-500 p-3 text-sm text-zinc-700 dark:text-zinc-300">
          {UI.onboarding.guard.notice}
        </p>
      )}

      {/* Ancre de visite : le registre RÉEL, dans l'état où Aigent le renvoie
          (agents publiés, registre vide, ou runtime non connecté). Rien n'est
          simulé ici : quand le runtime est en CONFIG, l'état est rendu tel quel. */}
      <section data-tour-id={AGENTS_ANCHORS.registry} className="flex flex-col gap-4">
        {view.kind === "unavailable" && <UnavailableState reason={view.reason} />}
        {view.kind === "error" && <ErrorState onRetry={refresh} retrying={refreshing} />}
        {view.kind === "loaded" && agents.length === 0 && <EmptyState />}

        {view.kind === "loaded" && agents.length > 0 && (
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                runnable={isRunnable(agent.status)}
                onRunStarted={(runId) => setActiveRunId(runId)}
                tourActive={tourActive}
                anchorRun={index === 0}
              />
            ))}
          </div>
        )}
      </section>

      {/* Suivi du run actif (état réel + événements + HITL). `key` = remount
          propre à chaque nouveau run → aucun reset d'état manuel dans l'effet. */}
      {activeRunId && (
        <RunTracker
          key={activeRunId}
          runId={activeRunId}
          onClose={() => setActiveRunId(null)}
          tourActive={tourActive}
        />
      )}

      {/* Frontière : cette page exploite, elle ne construit pas. */}
      <BoundaryNote />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({
  connected,
  published,
  runnable,
  onRefresh,
  refreshing,
}: {
  connected: boolean;
  published: number | null;
  runnable: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-pierre-blonde uppercase">
            <span aria-hidden className="h-px w-5 bg-pierre-blonde/60" />
            {t.kicker}
          </p>
          <Heading className="font-titre">{t.title}</Heading>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge color={connected ? "lime" : "zinc"}>
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-current opacity-70"
              />
              {connected ? t.statusLive : t.statusUnavailable}
            </Badge>
            <Text className="text-sm">{connected ? t.metaConnected : t.metaUnavailable}</Text>
          </div>
        </div>

        <Button color="light" onClick={onRefresh} disabled={refreshing}>
          <Icon name="agents" data-slot="icon" />
          {refreshing ? t.refreshing : t.refresh}
        </Button>
      </div>

      {/* KPI non encagés : compteurs discrets alignés, pas des grandes cards. */}
      {connected && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Kpi label={t.kpiPublished} value={published ?? 0} />
          <Kpi label={t.kpiRunnable} value={runnable ?? 0} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-titre text-2xl font-semibold text-zinc-900 tabular-nums">{value}</span>
      <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
    </div>
  );
}

/** Registre vide (connecté, aucun agent) — message simple et honnête. */
function EmptyState() {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl border border-zinc-950/10 text-zinc-400"
      >
        <Icon name="agents" className="size-6" />
      </span>
      <Strong className="text-base">{t.emptyTitle}</Strong>
      <Text className="max-w-md">{t.emptyBody}</Text>
    </div>
  );
}

/** Aigent non connecté (vars absentes / injoignable) — raison honnête. */
function UnavailableState({ reason }: { reason: RuntimeUnavailableReason }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-zinc-950/15 text-zinc-400"
      >
        <Icon name="agents" className="size-6" />
      </span>
      <Strong className="text-base">{t.unavailableTitle}</Strong>
      <Text className="max-w-md">{t.unavailableReasons[reason] ?? t.unavailableReasons.error}</Text>
    </div>
  );
}

function ErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Badge color="red">{UI.common.error}</Badge>
      <Text className="max-w-md">{t.loadError}</Text>
      <Button color="light" onClick={onRetry} disabled={retrying}>
        {retrying ? t.refreshing : t.retry}
      </Button>
    </div>
  );
}

function BoundaryNote() {
  return (
    <div className="border-t border-zinc-950/10 pt-4">
      <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {t.boundaryTitle}
      </span>
      <Text className="mt-1.5 max-w-2xl text-sm">{t.boundaryBody}</Text>
    </div>
  );
}
