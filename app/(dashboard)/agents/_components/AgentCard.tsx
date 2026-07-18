"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-strings";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AGENTS_ANCHORS } from "@/lib/onboarding/tours/agents";
import { blockDuringTour } from "@/lib/onboarding/tour-guard";
import type { PublishedAgent, PublishedAgentStatus } from "@/lib/aigent/runtime-types";

const t = UI.agentsPage;

/** Couleur de badge par statut de version (sémantique, cf. Badge color). */
function statusColor(
  status: PublishedAgentStatus,
): "lime" | "amber" | "zinc" | "red" {
  switch (status) {
    case "production":
      return "lime";
    case "testing":
    case "draft":
      return "amber";
    case "unavailable":
      return "red";
    default:
      return "zinc"; // specification / paused
  }
}

type ProxyRun = { id?: string };
type ProxyResponse =
  | { ok: true; data: ProxyRun }
  | { ok: false; unavailable: { reason: string } }
  | { ok: false; notFound: true }
  | { error: string };

/**
 * Carte d'un agent publié — consultation + lancement autorisé UNIQUEMENT.
 * Aucune édition de prompt/graphe/node. Le bouton « Lancer » est désactivé tant
 * que l'agent n'est pas exécutable (statut ≠ production) — état honnête, jamais
 * de faux lancement. Un lancement réussi remonte le `runId` au cockpit.
 */
export function AgentCard({
  agent,
  runnable,
  onRunStarted,
  tourActive,
  anchorRun,
}: {
  agent: PublishedAgent;
  runnable: boolean;
  onRunStarted: (runId: string) => void;
  /** LOT 10 — visite en cours : le lancement est expliqué, jamais déclenché. */
  tourActive: boolean;
  /** Ancre `agents-run` posée sur la 1re carte uniquement. */
  anchorRun: boolean;
}) {
  const [launching, setLaunching] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  async function launch() {
    if (blockDuringTour(tourActive, "agents-run")) return;
    setLaunching(true);
    setNote(null);
    try {
      const res = await fetch(`/api/aigent/agents/${encodeURIComponent(agent.id)}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      const json = (await res.json().catch(() => null)) as ProxyResponse | null;
      if (json && "ok" in json && json.ok && json.data.id) {
        setNote({ tone: "ok", msg: t.runStarted });
        onRunStarted(json.data.id);
        return;
      }
      // Registre vide / non provisionné / 404 → message honnête, aucun faux run.
      setNote({ tone: "err", msg: t.runStartFailed });
    } catch {
      setNote({ tone: "err", msg: t.runStartFailed });
    } finally {
      setLaunching(false);
    }
  }

  const statusLabel = t.agentStatus[agent.status] ?? agent.status;
  const capabilities = agent.capabilities ?? [];

  return (
    <div className="surface flex flex-col gap-4 p-5">
      {/* En-tête : nom + statut de version */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Strong className="text-base">{agent.name}</Strong>
          {agent.description ? (
            <Text className="mt-0.5 line-clamp-2">{agent.description}</Text>
          ) : null}
        </div>
        <Badge color={statusColor(agent.status)}>{statusLabel}</Badge>
      </div>

      {/* Méta : version + validation humaine */}
      <div className="flex flex-wrap items-center gap-1.5">
        {agent.version ? (
          <Badge color="zinc">
            {t.versionLabel} {agent.version}
          </Badge>
        ) : null}
        {agent.requiresHumanApproval ? <Badge color="amber">{t.hitlBadge}</Badge> : null}
      </div>

      {/* Capacités déclarées (informatif) */}
      {capabilities.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {t.capabilitiesLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((cap) => (
              <Badge key={cap} color="zinc">
                {cap}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {/* Action principale : lancer un run autorisé (désactivé si non exécutable) */}
      <div
        data-tour-id={anchorRun ? AGENTS_ANCHORS.run : undefined}
        className="mt-auto flex flex-col gap-2 border-t border-zinc-950/8 pt-4"
      >
        {runnable ? (
          <Button color="indigo" onClick={launch} disabled={launching || tourActive}>
            {launching ? t.launching : t.launch}
          </Button>
        ) : (
          <>
            <Button color="light" disabled aria-disabled="true">
              {t.launch}
            </Button>
            <Text className="text-xs">{t.launchBlockedStatus}</Text>
          </>
        )}
        {note ? (
          <Text className="text-xs">
            <Badge color={note.tone === "ok" ? "lime" : "red"}>{note.msg}</Badge>
          </Text>
        ) : null}
      </div>
    </div>
  );
}
