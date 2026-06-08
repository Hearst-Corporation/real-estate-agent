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
    return <div className="swarm-report-loading">{UI.common.loading}</div>;
  }
  if (error || !run) {
    return <div className="swarm-report-loading">{error ?? UI.swarms.runNotFound}</div>;
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
    <div className="swarm-report">
      <div className="swarm-report-head">
        <RunStatusBadge status={run.status} size="sm" />
        <span className="swarm-report-meta">{UI.swarms.runLaunchedAt(launched)}</span>
        {durS != null && (
          <span className="swarm-report-meta">· {durS}{UI.swarms.reportDurationUnit}</span>
        )}
        {tokens > 0 && (
          <span className="swarm-report-meta">
            · {tokens.toLocaleString("fr-FR")} {UI.swarms.reportTokens}
          </span>
        )}
        {run.cost_usd != null && run.cost_usd > 0 && (
          <span className="swarm-report-meta">· ${run.cost_usd.toFixed(3)}</span>
        )}
      </div>

      {run.status === "paused_hitl" && run.decision && (
        <div className="mv-dock">
          <span className="mv-pill mv-pill-ask">{UI.missions.decisionPill}</span>
          <div className="mv-q">{run.decision.question}</div>
          {run.decision.hint && <div className="mv-hint">{run.decision.hint}</div>}
          <div className="mv-choices">
            {run.decision.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="mv-choice"
                disabled={sending !== null}
                aria-busy={sending === o.value}
                onClick={() => void choose(o.value)}
              >
                {sending === o.value ? UI.missions.decisionBusy : o.label}
              </button>
            ))}
          </div>
          {decisionErr && (
            <div className="mv-hint mv-dock-err">{UI.missions.decisionError}</div>
          )}
        </div>
      )}

      {isActive && run.status !== "paused_hitl" && (
        <div className="swarm-report-active">
          <span className="swarm-spinner" />
          {UI.swarms.runActive}
        </div>
      )}

      {run.output ? (
        <ReportMarkdown text={run.output} />
      ) : !isActive ? (
        <p className="ct-placeholder">{UI.swarms.reportEmpty}</p>
      ) : null}

      {steps.length > 0 && (
        <details className="swarm-report-tech">
          <summary>{UI.swarms.reportTechnicalDetails}</summary>
          <ol className="swarm-steps-timeline">
            {steps.map((s, i) => (
              <li key={s.id ?? i} className="swarm-step-item">
                <div className="swarm-step-header">
                  {s.agent && <span>{s.agent}</span>}
                  {s.agent && s.task && <span>·</span>}
                  {s.task && <span>{s.task}</span>}
                </div>
                {s.output && (
                  <div className="swarm-step-output">
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
