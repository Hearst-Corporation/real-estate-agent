"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { dateFr, dateTimeFr } from "@/lib/crm/format";
import RunStatusBadge from "@/components/swarms/RunStatusBadge";
import SwarmKickoffPanel from "@/components/swarms/SwarmKickoffPanel";
import type { Swarm, SwarmRun } from "@/lib/swarms/types";

type Tab = "config" | "agents" | "runs";

export default function SwarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);

  const [swarm, setSwarm] = useState<Swarm | null>(null);
  const [runs, setRuns] = useState<SwarmRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("config");
  const [showKickoff, setShowKickoff] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const loadSwarm = useCallback(async (swarmId: string) => {
    try {
      const [swarmRes, runsRes] = await Promise.all([
        fetch(`/api/swarms/${swarmId}`),
        fetch(`/api/swarms/${swarmId}/runs`),
      ]);
      if (!swarmRes.ok) throw new Error(`HTTP ${swarmRes.status}`);
      const swarmData = (await swarmRes.json()) as { item: Swarm };
      const swarm = swarmData.item;
      setSwarm(swarm);
      setEditName(swarm.name);
      setEditDesc(swarm.description ?? "");
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as { items: SwarmRun[] };
        setRuns(runsData.items ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : UI.swarms.loadingError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSwarm(id);
  }, [id, loadSwarm]);

  async function handleEdit() {
    if (!id || !swarm) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/swarms/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedData = (await res.json()) as { item: Swarm };
      setSwarm(updatedData.item);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : UI.swarms.loadingError);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/swarms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/swarms");
    } catch {
      setDeleteLoading(false);
      setDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "var(--ct-space-lg)", color: "var(--ct-text-muted)" }}>
        {UI.common.loading}
      </div>
    );
  }

  if (error || !swarm) {
    return (
      <div style={{ padding: "var(--ct-space-lg)" }}>
        <p style={{ color: "var(--ct-text-danger)" }}>{error ?? UI.swarms.notFound}</p>
        <Link href="/swarms" className="ct-btn ct-btn-secondary" style={{ marginTop: "var(--ct-space-md)", display: "inline-block" }}>
          {UI.swarms.backToSwarms}
        </Link>
      </div>
    );
  }

  const createdAt = dateFr(swarm.created_at);

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ct-space-md)", marginBottom: "var(--ct-space-lg)", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p className="ct-eyebrow">
            <Link href="/swarms" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
              {UI.nav.swarms}
            </Link>{" "}
            /
          </p>
          <h1 className="ct-title" style={{ marginBottom: "var(--ct-space-xs)" }}>
            {swarm.name}
          </h1>
          <span className={`swarm-status-badge ${swarm.is_active ? "swarm-status-done" : "swarm-status-failed"}`}>
            {swarm.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--ct-space-sm)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ct-btn ct-btn-primary"
            onClick={() => setShowKickoff((v) => !v)}
          >
            {showKickoff ? UI.swarms.hideBtn : UI.swarms.launchBtn}
          </button>
          <button
            type="button"
            className="ct-btn ct-btn-secondary"
            onClick={() => { setEditing((v) => !v); setEditError(null); }}
          >
            {UI.swarms.editBtn}
          </button>
          {!deleteConfirm ? (
            <button
              type="button"
              className="ct-btn"
              style={{ color: "var(--ct-text-danger)", borderColor: "var(--ct-text-danger)" }}
              onClick={() => setDeleteConfirm(true)}
            >
              {UI.swarms.deleteBtn}
            </button>
          ) : (
            <div style={{ display: "flex", gap: "var(--ct-space-xs)", alignItems: "center" }}>
              <span style={{ fontSize: "var(--ct-fs-sm)", color: "var(--ct-text-muted)" }}>{UI.swarms.confirmDelete}</span>
              <button
                type="button"
                className="ct-btn"
                style={{ color: "var(--ct-text-danger)" }}
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? UI.common.busy : UI.swarms.confirmYes}
              </button>
              <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setDeleteConfirm(false)}>
                {UI.swarms.confirmNo}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.editTitle}</p>
            <input
              className="crm-input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={UI.swarms.manualSectionGeneral}
              style={{ marginBottom: "var(--ct-space-sm)" }}
            />
            <input
              className="crm-input"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={UI.swarms.manualDescPlaceholder}
              style={{ marginBottom: "var(--ct-space-sm)" }}
            />
            {editError && (
              <p style={{ color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-sm)", marginBottom: "var(--ct-space-sm)" }}>
                {editError}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--ct-space-sm)" }}>
              <button type="button" className="ct-btn ct-btn-primary" onClick={handleEdit} disabled={editLoading}>
                {editLoading ? UI.swarms.editSaving : UI.swarms.editSave}
              </button>
              <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setEditing(false)}>
                {UI.swarms.editCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kickoff panel */}
      {showKickoff && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.launchPanelTitle}</p>
            <SwarmKickoffPanel
              swarmId={swarm.id}
              swarmName={swarm.name}
              onDone={() => { if (id) void loadSwarm(id); }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="swarm-tabs">
        <button type="button" className={`swarm-tab-btn${tab === "config" ? " active" : ""}`} onClick={() => setTab("config")}>
          {UI.swarms.configTab}
        </button>
        <button type="button" className={`swarm-tab-btn${tab === "agents" ? " active" : ""}`} onClick={() => setTab("agents")}>
          {UI.swarms.agentsTab}
        </button>
        <button type="button" className={`swarm-tab-btn${tab === "runs" ? " active" : ""}`} onClick={() => setTab("runs")}>
          {UI.swarms.runsTab}
        </button>
      </div>

      {/* Tab: Configuration */}
      {tab === "config" && (
        <div className="ct-card">
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.manualSectionGeneral}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-xs)" }}>
              <div>
                <span style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)" }}>{UI.swarms.metaName}</span>
                <p style={{ fontSize: "var(--ct-fs-md)", color: "var(--ct-text-primary)", margin: 0 }}>{swarm.name}</p>
              </div>
              {swarm.description && (
                <div>
                  <span style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)" }}>{UI.swarms.metaDescription}</span>
                  <p style={{ fontSize: "var(--ct-fs-base)", color: "var(--ct-text-body)", margin: 0 }}>{swarm.description}</p>
                </div>
              )}
              <div>
                <span style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)" }}>{UI.swarms.metaCreatedAt}</span>
                <p style={{ fontSize: "var(--ct-fs-base)", color: "var(--ct-text-body)", margin: 0 }}>{createdAt}</p>
              </div>
            </div>

            {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
              <div style={{ marginTop: "var(--ct-space-md)" }}>
                <p className="ct-card-title">{UI.swarms.toolsTitle}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ct-space-xs)" }}>
                  {swarm.tool_bindings.map((tb, i) => (
                    <span key={i} className="swarm-tool-badge">{tb.tool_id}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Agents & Tasks */}
      {tab === "agents" && (
        <div className="swarm-agents-grid">
          <div>
            <p className="swarm-form-section-title">{UI.swarms.agentsCount(swarm.agents?.length ?? 0)}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
              {(swarm.agents ?? []).map((agent, i) => (
                <div key={agent.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{agent.name}</p>
                  <p className="swarm-agent-role">{agent.role}</p>
                  {agent.goal && <p className="swarm-agent-goal">{agent.goal}</p>}
                  {agent.backstory && (
                    <p style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)", marginTop: "var(--ct-space-2xs)" }}>{agent.backstory}</p>
                  )}
                </div>
              ))}
              {(swarm.agents ?? []).length === 0 && (
                <p className="ct-placeholder">{UI.swarms.agentsEmpty}</p>
              )}
            </div>
          </div>
          <div>
            <p className="swarm-form-section-title">{UI.swarms.tasksCount(swarm.tasks?.length ?? 0)}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
              {(swarm.tasks ?? []).map((task, i) => (
                <div key={task.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{task.name}</p>
                  {task.description && <p className="swarm-agent-goal">{task.description}</p>}
                  {task.expected_output && (
                    <p style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)", marginTop: "var(--ct-space-2xs)" }}>
                      {UI.swarms.expectedOutputPrefix}{task.expected_output}
                    </p>
                  )}
                  {task.agent_name && (
                    <span className="swarm-tool-badge" style={{ marginTop: "var(--ct-space-2xs)", display: "inline-block" }}>
                      {task.agent_name}
                    </span>
                  )}
                </div>
              ))}
              {(swarm.tasks ?? []).length === 0 && (
                <p className="ct-placeholder">{UI.swarms.tasksEmpty}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Runs */}
      {tab === "runs" && id && (
        <RunsTab swarmId={id} runs={runs} onRefresh={() => void loadSwarm(id)} />
      )}
    </>
  );
}

function RunsTab({
  swarmId,
  runs,
  onRefresh,
}: {
  swarmId: string;
  runs: SwarmRun[];
  onRefresh: () => void;
}) {
  const [launching, setLaunching] = useState(false);

  async function handleRelaunch() {
    setLaunching(true);
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRefresh();
    } catch {
      // ignore
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="ct-card">
      <div className="ct-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ct-space-md)" }}>
          <p className="ct-card-title">{UI.swarms.runsHistory}</p>
          <button
            type="button"
            className="ct-btn ct-btn-primary"
            onClick={handleRelaunch}
            disabled={launching}
          >
            {launching ? UI.swarms.runsRelaunching : UI.swarms.runsRelaunch}
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="ct-placeholder">{UI.swarms.runsEmpty}</p>
        ) : (
          <div>
            {runs.map((run) => {
              const date = dateTimeFr(run.created_at);
              return (
                <div key={run.run_id} className="swarm-run-row">
                  <span className="swarm-run-id">{run.run_id}</span>
                  <RunStatusBadge status={run.status} size="sm" />
                  <span style={{ fontSize: "var(--ct-fs-sm)", color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>{date}</span>
                  <Link
                    href={`/swarms/${swarmId}/run/${run.run_id}`}
                    className="ct-btn ct-btn-secondary"
                    style={{ fontSize: "var(--ct-fs-xs)", padding: "var(--ct-space-2xs) var(--ct-space-xs)", textDecoration: "none", display: "inline-block" }}
                  >
                    {UI.swarms.runsView}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
