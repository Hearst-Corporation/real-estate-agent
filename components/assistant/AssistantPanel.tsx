"use client";

/**
 * components/assistant/AssistantPanel.tsx — ASSISTANT OPÉRATIONNEL (W9).
 *
 * Panneau dédié : l'assistant ANALYSE les signaux réels, PROPOSE la prochaine
 * action, et peut PRÉPARER un brouillon — jamais envoyer, jamais muter en direct.
 * Chaque proposition affiche sa justification déterministe (facteurs nommés).
 *
 * Vérité à l'écran :
 *   - `automation` distingue LIVE (agents publiés) / CONFIG (Aigent non branché,
 *     analyse locale active) / UNAVAILABLE — jamais un faux agent ni un faux run.
 *   - `signals` affiche LIVE / UNAVAILABLE par source d'analyse.
 *   - L'action « brouillon » crée un DRAFT dans l'Outbox (validation humaine
 *     ensuite) ; l'action « approbation » route vers la boîte HITL.
 *
 * Palette accent (or) + zinc, états loading / empty / error / success, focus
 * clavier visible, responsive 390→1440, zéro scroll horizontal.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon, ChevronRightIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { timeFr } from "@/lib/crm/format";
import { ASSISTANT, FACTOR_LABEL, automationLabel } from "@/lib/assistant-ops/labels";
import type {
  AssistantResponse,
  Proposal,
  SignalStatus,
} from "@/lib/assistant-ops/types";

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: AssistantResponse };

/** État de création de brouillon, par proposition (jamais global). */
type DraftState = Record<string, "idle" | "pending" | "done" | "failed">;

// ─── Sous-composants ─────────────────────────────────────────────────────────

/** Pastille LIVE / UNAVAILABLE d'une source d'analyse (vérité honnête). */
function SignalBadge({ label, status }: { label: string; status: SignalStatus }) {
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
        · {status === "live" ? ASSISTANT.signals.live : ASSISTANT.signals.unavailable}
      </span>
    </span>
  );
}

/** Bandeau d'état de l'automatisation Aigent — CONFIG explicite si non branchée. */
function AutomationBanner({ data }: { data: AssistantResponse }) {
  const a = data.automation;
  const live = a.mode === "live";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-zinc-950/8 bg-white px-4 py-3">
      <Badge variant={live ? "brand" : "neutral"}>{ASSISTANT.automation.title}</Badge>
      <Text className="min-w-0 flex-1 text-sm text-zinc-500">{automationLabel(a)}</Text>
    </div>
  );
}

/** Barre de priorité compacte (0..100) — accent or, tabulaire. */
function PriorityBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-950/5"
        role="img"
        aria-label={`Priorité ${value}`}
      >
        <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-semibold tabular-nums text-accent-700">
        {value}
      </span>
    </div>
  );
}

/** Ventilation lisible de la priorité (facteurs nommés qui l'ont fait monter). */
function ProposalWhy({ p }: { p: Proposal }) {
  const parts = p.factors
    .filter((f) => f.points > 0)
    .map((f) => `${FACTOR_LABEL[f.factor]} +${f.points}`);
  if (parts.length === 0) return null;
  return (
    <Text className="mt-1 truncate text-xs text-zinc-400">
      <span className="text-zinc-500">{ASSISTANT.why} :</span> {parts.join(" · ")}
    </Text>
  );
}

/** Une proposition + son unique action sûre (ouvrir / brouillon / approbation). */
function ProposalCard({
  p,
  draftState,
  onDraft,
}: {
  p: Proposal;
  draftState: DraftState[string];
  onDraft: (p: Proposal) => void;
}) {
  const isDraft = p.action.kind === "draft";
  const actionLabel =
    p.action.kind === "approval"
      ? ASSISTANT.actions.approval
      : isDraft
        ? ASSISTANT.actions.draft
        : ASSISTANT.actions.open;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-950/8 bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] focus-within:border-accent-500/40 hover:border-accent-500/40 hover:shadow-[var(--shadow-card-hover)] @sm:flex-row @sm:items-center @sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="truncate font-medium text-zinc-950">{p.title}</Text>
          {p.urgency === "haute" && (
            <Badge variant="neutral" className="shrink-0">
              {ASSISTANT.urgency.haute}
            </Badge>
          )}
        </div>
        <Text className="text-sm text-zinc-500">{p.rationale}</Text>
        <ProposalWhy p={p} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 @sm:flex-col @sm:items-end @sm:gap-1.5">
        <PriorityBar value={p.priority} />
        {isDraft ? (
          <Button
            plain
            onClick={() => onDraft(p)}
            disabled={draftState === "pending" || draftState === "done"}
          >
            <PencilSquareIcon aria-hidden />
            {draftState === "pending"
              ? ASSISTANT.actions.drafting
              : draftState === "done"
                ? ASSISTANT.actions.drafted
                : draftState === "failed"
                  ? ASSISTANT.actions.draftFailed
                  : actionLabel}
          </Button>
        ) : (
          <Link
            href={p.action.href}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-accent-700 transition-colors hover:text-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            {actionLabel}
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

export function AssistantPanel() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [drafts, setDrafts] = useState<DraftState>({});

  const load = useCallback(async (): Promise<LoadState> => {
    try {
      const res = await fetch("/api/assistant-ops", { cache: "no-store" });
      if (!res.ok) return { phase: "error" };
      const data = (await res.json()) as AssistantResponse;
      return { phase: "ready", data };
    } catch {
      return { phase: "error" };
    }
  }, []);

  const refresh = useCallback(() => {
    setState({ phase: "loading" });
    void load().then(setState);
  }, [load]);

  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  /**
   * Matérialise une proposition en BROUILLON (outbox DRAFT). Aucune communication
   * n'est envoyée : le message attend une validation humaine dans l'Outbox.
   */
  const onDraft = useCallback(async (p: Proposal) => {
    if (p.action.kind !== "draft") return;
    setDrafts((d) => ({ ...d, [p.id]: "pending" }));
    try {
      const res = await fetch("/api/assistant-ops/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: p.action.leadId,
          channel: p.action.channel,
          subject: p.title,
          body: p.rationale,
        }),
      });
      setDrafts((d) => ({ ...d, [p.id]: res.ok ? "done" : "failed" }));
    } catch {
      setDrafts((d) => ({ ...d, [p.id]: "failed" }));
    }
  }, []);

  const total = state.phase === "ready" ? state.data.total : 0;

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 @container">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-600">
            <span aria-hidden className="h-px w-6 bg-accent-500/70" />
            {ASSISTANT.eyebrow}
          </p>
          <Heading className="mt-2">{ASSISTANT.title}</Heading>
          <Text className="mt-1 text-zinc-500">{ASSISTANT.subtitle(total)}</Text>
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

      {state.phase === "ready" && (
        <>
          <AutomationBanner data={state.data} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-zinc-950/8 bg-white px-4 py-3">
            <SignalBadge label={ASSISTANT.signals.actions} status={state.data.signals.actions} />
            <SignalBadge
              label={ASSISTANT.signals.conversion}
              status={state.data.signals.conversion}
            />
            <SignalBadge
              label={ASSISTANT.signals.reactivation}
              status={state.data.signals.reactivation}
            />
            <span className="ml-auto text-xs text-zinc-400">
              {ASSISTANT.computedAt(timeFr(state.data.computedAt))}
            </span>
          </div>
        </>
      )}

      {state.phase === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-zinc-950/5" />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <div className="surface flex flex-col items-start gap-3 rounded-xl p-6">
          <Text className="text-zinc-950">
            <Strong>Impossible de charger l&apos;assistant.</Strong>
          </Text>
          <Text className="text-zinc-500">Réessaie dans un instant.</Text>
          <Button color="indigo" onClick={() => refresh()}>
            Réessayer
          </Button>
        </div>
      )}

      {state.phase === "ready" && state.data.proposals.length === 0 && (
        <div className="surface flex flex-col items-center gap-3 rounded-xl px-6 py-12 text-center">
          <Text className="font-medium text-zinc-950">{ASSISTANT.empty}</Text>
          <Text className="text-zinc-500">{ASSISTANT.emptyHint}</Text>
        </div>
      )}

      {state.phase === "ready" && state.data.proposals.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.data.proposals.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              draftState={drafts[p.id] ?? "idle"}
              onDraft={(x) => void onDraft(x)}
            />
          ))}
        </ul>
      )}

      {/* Garde-fou explicite : l'assistant ne fait rien tout seul. */}
      <Text className="text-xs text-zinc-400">{ASSISTANT.safety}</Text>
    </section>
  );
}
