"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { UI } from "@/lib/ui-strings";
import { dateTimeFr } from "@/lib/crm/format";
import RunStatusBadge from "./RunStatusBadge";
import ReportMarkdown from "./ReportMarkdown";
import type { SwarmRun, SwarmRunStatus, SwarmStep } from "@/lib/swarms/types";

const POLL_MS = 3000;
const ACTIVE: SwarmRunStatus[] = ["pending", "running", "paused_hitl"];
const STEP_MAX_CHARS = 600;

export default function RunReport({
  swarmId,
  runId,
}: {
  swarmId: string;
  runId: string;
}) {
  const [run, setRun] = useState<SwarmRun | null>(null);
  const [steps, setSteps] = useState<SwarmStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [decisionErr, setDecisionErr] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/swarms/${swarmId}/runs/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { run: SwarmRun; steps: SwarmStep[] };
      setRun(data.run);
      setSteps(data.steps ?? []);
      setLoading(false);
      if (!ACTIVE.includes(data.run.status)) stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : UI.swarms.loadingError);
      setLoading(false);
      stop();
    }
  }, [swarmId, runId]);

  const choose = async (value: string) => {
    setSending(value);
    setDecisionErr(false);
    try {
      const res = await fetch(`/api/swarms/${swarmId}/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        setDecisionErr(true);
      } else {
        await fetchRun();
      }
    } catch {
      setDecisionErr(true);
    } finally {
      setSending(null);
    }
  };

  // (Re)charge quand le run sélectionné change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true);
    setError(null);
    setRun(null);
    setSteps([]);
    void fetchRun();
    return stop;
  }, [fetchRun]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Poll tant que le run est actif.
  useEffect(() => {
    if (!run) return;
    if (ACTIVE.includes(run.status)) {
      stop();
      timer.current = setInterval(() => void fetchRun(), POLL_MS);
    }
    return stop;
  }, [run?.status, fetchRun]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">{UI.common.loading}</div>;
  }
  if (error || !run) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">{error ?? UI.swarms.runNotFound}</div>
    );
  }

  const isActive = ACTIVE.includes(run.status);
  const launched = run.created_at ? dateTimeFr(run.created_at) : "—";
  const durMs =
    run.created_at && run.updated_at
      ? new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()
      : null;
  const durS = durMs && durMs > 500 ? Math.round(durMs / 1000) : null;
  const tokens = (run.tokens_in ?? 0) + (run.tokens_out ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <RunStatusBadge status={run.status} size="sm" />
        <span>{UI.swarms.runLaunchedAt(launched)}</span>
        {durS != null && (
          <span>· {durS}{UI.swarms.reportDurationUnit}</span>
        )}
        {tokens > 0 && (
          <span>
            · {tokens.toLocaleString("fr-FR")} {UI.swarms.reportTokens}
          </span>
        )}
        {run.cost_usd != null && run.cost_usd > 0 && (
          <span>· ${run.cost_usd.toFixed(3)}</span>
        )}
      </div>

      {run.status === "paused_hitl" && run.decision && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <span className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            {UI.missions.decisionPill}
          </span>
          <div className="text-sm font-medium text-slate-100">{run.decision.question}</div>
          {run.decision.hint && <div className="text-xs text-slate-400">{run.decision.hint}</div>}
          <div className="flex flex-wrap gap-2">
            {run.decision.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                disabled={sending !== null}
                aria-busy={sending === o.value}
                onClick={() => void choose(o.value)}
              >
                {sending === o.value ? UI.missions.decisionBusy : o.label}
              </button>
            ))}
          </div>
          {decisionErr && (
            <div className="text-xs text-red-400">{UI.missions.decisionError}</div>
          )}
        </div>
      )}

      {isActive && run.status !== "paused_hitl" && (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="size-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" aria-hidden="true" />
          {UI.swarms.runActive}
        </div>
      )}

      {run.output ? (
        <ReportMarkdown text={run.output} />
      ) : !isActive ? (
        <p className="py-8 text-center text-sm text-slate-500">{UI.swarms.reportEmpty}</p>
      ) : null}

      {steps.length > 0 && (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-300 select-none">
            {UI.swarms.reportTechnicalDetails}
          </summary>
          <ol className="mt-3 flex flex-col gap-3">
            {steps.map((s, i) => (
              <li key={s.id ?? i} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  {s.agent && <span className="font-medium text-slate-200">{s.agent}</span>}
                  {s.agent && s.task && <span>·</span>}
                  {s.task && <span>{s.task}</span>}
                </div>
                {s.output && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 font-mono text-xs whitespace-pre-wrap text-slate-300">
                    {s.output.length > STEP_MAX_CHARS
                      ? s.output.slice(0, STEP_MAX_CHARS) + "…"
                      : s.output}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
