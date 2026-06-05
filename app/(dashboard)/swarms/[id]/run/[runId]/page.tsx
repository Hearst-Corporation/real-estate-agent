"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { UI } from "@/lib/ui-strings";
import RunStatusBadge from "@/components/swarms/RunStatusBadge";
import StepsTimeline from "@/components/swarms/StepsTimeline";
import { useRouter } from "next/navigation";
import type { SwarmRun, SwarmRunStatus, SwarmStep } from "@/lib/swarms/types";

const POLL_INTERVAL_MS = 3000;
const ACTIVE_STATUSES: SwarmRunStatus[] = ["pending", "running"];

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const router = useRouter();

  const [run, setRun] = useState<SwarmRun | null>(null);
  const [steps, setSteps] = useState<SwarmStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [relaunching, setRelaunching] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    params.then((p) => {
      setId(p.id);
      setRunId(p.runId);
    });
  }, [params]);

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const fetchRun = useCallback(async (swarmId: string, rId: string) => {
    try {
      const res = await fetch(`/api/swarms/${swarmId}/runs/${rId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { run: SwarmRun; steps: SwarmStep[] };
      setRun(data.run);
      setSteps(data.steps ?? []);
      setLoading(false);
      if (!ACTIVE_STATUSES.includes(data.run.status)) {
        stopPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : UI.swarms.loadingError);
      setLoading(false);
      stopPolling();
    }
  }, []);

  useEffect(() => {
    if (!id || !runId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRun(id, runId);
    return () => {
      stopPolling();
    };
  }, [id, runId, fetchRun]);

  useEffect(() => {
    if (!id || !runId || !run) return;
    if (ACTIVE_STATUSES.includes(run.status)) {
      stopPolling();
      intervalRef.current = setInterval(() => fetchRun(id, runId), POLL_INTERVAL_MS);
    }
    return () => {
      stopPolling();
    };
  }, [run?.status, id, runId, fetchRun]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRelaunch() {
    if (!id) return;
    setRelaunching(true);
    try {
      const res = await fetch(`/api/swarms/${id}/kickoff`, { method: "POST" });
      if (res.ok) {
        const kickoffData = (await res.json()) as { runId: string; swarmId: string };
        router.push(`/swarms/${kickoffData.swarmId}/run/${kickoffData.runId}`);
      }
    } catch {
      // ignore
    } finally {
      setRelaunching(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "var(--ct-space-lg)", color: "var(--ct-text-muted)" }}>
        Chargement…
      </div>
    );
  }

  if (error || !run) {
    return (
      <div style={{ padding: "var(--ct-space-lg)" }}>
        <p style={{ color: "var(--ct-text-danger)" }}>{error ?? "Run introuvable."}</p>
        {id && (
          <Link href={`/swarms/${id}`} className="ct-btn ct-btn-secondary" style={{ marginTop: "var(--ct-space-md)", display: "inline-block" }}>
            {UI.swarms.backToSwarm}
          </Link>
        )}
      </div>
    );
  }

  const isActive = ACTIVE_STATUSES.includes(run.status);
  const isFailed = run.status === "failed" || run.status === "error";
  const createdAt = run.created_at
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(run.created_at)
      )
    : "—";

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: "var(--ct-space-lg)" }}>
        <p className="ct-eyebrow">
          {id && (
            <>
              <Link href="/swarms" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
                Swarms
              </Link>
              {" / "}
              <Link href={`/swarms/${id}`} style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
                {id}
              </Link>
              {" / Run"}
            </>
          )}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ct-space-md)", flexWrap: "wrap" }}>
          <h1 className="ct-title" style={{ marginBottom: 0 }}>
            Run
          </h1>
          <code style={{ fontSize: 12, color: "var(--ct-text-muted)", background: "var(--ct-surface-2)", padding: "2px 8px", borderRadius: 6 }}>
            {run.run_id}
          </code>
          <RunStatusBadge status={run.status} />
        </div>
        <p style={{ fontSize: 12, color: "var(--ct-text-muted)", marginTop: "var(--ct-space-xs)" }}>
          {UI.swarms.runLaunchedAt(createdAt)}
        </p>
      </div>

      {/* Status indicator */}
      {isActive && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body" style={{ display: "flex", alignItems: "center", gap: "var(--ct-space-sm)" }}>
            <span className="swarm-spinner" />
            <span style={{ fontSize: 13, color: "var(--ct-text-muted)" }}>{UI.swarms.runActive}</span>
          </div>
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.runStepsTitle}</p>
            <StepsTimeline steps={steps} />
          </div>
        </div>
      )}

      {/* Output */}
      {run.status === "done" && run.output && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.runResultTitle}</p>
            <pre className="swarm-spec-preview">{run.output}</pre>
          </div>
        </div>
      )}

      {/* Failed actions */}
      {isFailed && (
        <div style={{ display: "flex", gap: "var(--ct-space-sm)" }}>
          <button
            type="button"
            className="ct-btn ct-btn-primary"
            onClick={handleRelaunch}
            disabled={relaunching}
          >
            {relaunching ? UI.swarms.runRelaunching : UI.swarms.runRelaunchCta}
          </button>
        </div>
      )}
    </>
  );
}
