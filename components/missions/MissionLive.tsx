"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionView, PhaseStatus } from "@/lib/missions/types";
import { PageStack, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

const t = UI.missions;
const STORY_ICON: Record<PhaseStatus, string> = { done: "✓", now: "◐", ask: "⏳", todo: "○" };

/** Classes de pill par statut — fond/texte/bordure teintés, cohérents avec le thème indigo/emerald/amber. */
const PILL_TONE: Record<string, string> = {
  done: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  now: "border-indigo-400/30 bg-indigo-500/10 text-indigo-300",
  ask: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  wait: "border-white/10 bg-white/[0.06] text-slate-400",
  todo: "border-white/10 bg-white/[0.06] text-slate-400",
};
const PHASE_PILL_TONE: Record<PhaseStatus, string> = {
  done: PILL_TONE.done,
  now: PILL_TONE.now,
  ask: PILL_TONE.ask,
  todo: PILL_TONE.wait,
};
const ACTIVE = new Set(["planning", "running", "awaiting_decision"]);
const POLL_MS = 3000;

/** Mission View réelle : poll l'état traduit et l'affiche en langage humain. */
export function MissionLive({ initial, id }: { initial: MissionView; id: string }) {
  const [v, setV] = useState<MissionView>(initial);
  const [sending, setSending] = useState<string | null>(null);
  const [decisionErr, setDecisionErr] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/missions/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const json = (await r.json()) as { view?: MissionView };
      if (json.view && alive.current) setV(json.view);
    } catch {
      /* moteur indispo : on garde l'état connu */
    }
  }, [id]);

  /** Soumet le choix d'un moment de décision, puis re-poll immédiatement. */
  async function choose(value: string) {
    setSending(value);
    setDecisionErr(false);
    try {
      const r = await fetch(`/api/missions/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!r.ok) {
        if (alive.current) setDecisionErr(true);
        return;
      }
      await refresh();
    } catch {
      if (alive.current) setDecisionErr(true);
    } finally {
      if (alive.current) setSending(null);
    }
  }

  useEffect(() => {
    if (!ACTIVE.has(v.status)) return;
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, [refresh, v.status]);

  const headPillTone =
    v.status === "done"
      ? PILL_TONE.done
      : v.status === "failed" || v.status === "awaiting_decision"
        ? PILL_TONE.ask
        : v.status === "paused"
          ? PILL_TONE.wait
          : PILL_TONE.now;

  return (
    <PageStack>
      {/* Header de mission */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-white/[0.03] to-white/[0.03] p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">{v.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${headPillTone}`}
          >
            {v.humanStatus}
          </span>
          <span>{v.stepLabel}</span>
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.08]">
            <i
              className="block h-full rounded-full bg-indigo-400 transition-[width]"
              style={{ width: `${v.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Progression | Espace vivant */}
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={t.progression}>
          <div className="flex flex-col gap-2">
            {v.phases.map((p) => (
              <div
                key={p.key}
                className={`flex items-start gap-2 text-sm ${
                  p.status === "todo" ? "text-slate-500" : "text-slate-200"
                }`}
              >
                <span className="shrink-0" aria-hidden="true">
                  {STORY_ICON[p.status]}
                </span>
                <span>{p.story}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t.canvas}>
          <div className="flex flex-col">
              {v.phases.map((p, i) => {
                const open = p.status === "now" || p.status === "ask";
                return (
                  <div key={p.key}>
                    <div
                      className={`rounded-xl border p-4 transition-colors ${
                        open ? "border-indigo-400/30 bg-indigo-500/[0.06]" : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none" aria-hidden="true">
                          {p.emo}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-100">{p.nm}</div>
                          <div className="text-xs text-slate-400">{p.story}</div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${PHASE_PILL_TONE[p.status]}`}
                        >
                          {t.phase[p.status]}
                        </span>
                      </div>
                      {open && (
                        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t.doing}
                            </div>
                            <div className="mt-1 text-sm text-slate-200">{p.doing}</div>
                          </div>
                          {p.found.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t.found}
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                <ul className="list-inside list-disc space-y-1">
                                  {p.found.map((f, j) => (
                                    <li key={j}>{f}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {i < v.phases.length - 1 && (
                      <div className="py-1 text-center text-slate-600" aria-hidden="true">
                        ↓
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      {/* État d'erreur humain */}
      {v.error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-4">
          <div className="text-sm font-semibold text-red-300">{t.errorTitle}</div>
          <div className="mt-1 text-sm text-red-200/90">{v.error}</div>
        </div>
      )}

      {/* Moment de décision — émis par le moteur (status paused_hitl) */}
      {v.decision && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5">
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${PILL_TONE.ask}`}
          >
            {t.decisionPill}
          </span>
          <div className="text-sm font-semibold text-slate-100">{v.decision.question}</div>
          {v.decision.hint && <div className="text-xs text-slate-400">{v.decision.hint}</div>}
          <div className="flex flex-wrap gap-2">
            {v.decision.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sending !== null}
                aria-busy={sending === o.value}
                onClick={() => choose(o.value)}
              >
                {sending === o.value ? t.decisionBusy : o.label}
              </button>
            ))}
          </div>
          {decisionErr && <div className="text-xs text-red-400">{t.decisionError}</div>}
        </div>
      )}

      {/* Aperçu du résultat */}
      {v.output && (
        <Card title={t.output}>
          {v.output.hook && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.hook}</div>
              <div className="mt-1 text-lg font-semibold text-white">{v.output.hook}</div>
            </div>
          )}
          {v.output.body && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.detail}</div>
              <div className="mt-1 text-sm text-slate-200">{v.output.body}</div>
            </div>
          )}
        </Card>
      )}
    </PageStack>
  );
}
