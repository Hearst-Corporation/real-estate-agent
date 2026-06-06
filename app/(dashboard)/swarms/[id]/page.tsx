"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { dateFr, dateTimeFr } from "@/lib/crm/format";
import RunStatusBadge from "@/components/swarms/RunStatusBadge";
import RunReport from "@/components/swarms/RunReport";
import SwarmKickoffPanel from "@/components/swarms/SwarmKickoffPanel";
import type { Swarm, SwarmRun } from "@/lib/swarms/types";

type Tab = "config" | "agents" | "runs";

// Longueur d'affichage abrégé d'un run_id sur la carte du strip.
const RUN_ID_SHORT_LEN = 8;

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
    return <div className="swarm-state">{UI.common.loading}</div>;
  }

  if (error || !swarm) {
    return (
      <div className="swarm-state">
        <p className="swarm-state-error">{error ?? UI.swarms.notFound}</p>
        <Link href="/swarms" className="ct-btn ct-btn-secondary swarm-state-back">
          {UI.swarms.backToSwarms}
        </Link>
      </div>
    );
  }

  const createdAt = dateFr(swarm.created_at);

  return (
    <>
      {/* Header */}
      <div className="swarm-detail-head">
        <div className="swarm-detail-head-main">
          <p className="ct-eyebrow">
            <Link href="/swarms" className="swarm-crumb">
              {UI.nav.swarms}
            </Link>{" "}
            /
          </p>
          <h1 className="ct-title swarm-detail-title">{swarm.name}</h1>
          <span className={`swarm-status-badge ${swarm.is_active ? "swarm-status-done" : "swarm-status-failed"}`}>
            {swarm.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}
          </span>
        </div>
        <div className="swarm-detail-actions">
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
              className="ct-btn swarm-btn-danger"
              onClick={() => setDeleteConfirm(true)}
            >
              {UI.swarms.deleteBtn}
            </button>
          ) : (
            <div className="swarm-delete-confirm">
              <span className="swarm-delete-confirm-label">{UI.swarms.confirmDelete}</span>
              <button
                type="button"
                className="ct-btn swarm-btn-danger"
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
        <div className="ct-card swarm-block">
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.editTitle}</p>
            <input
              className="crm-input swarm-field"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={UI.swarms.manualSectionGeneral}
            />
            <input
              className="crm-input swarm-field"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={UI.swarms.manualDescPlaceholder}
            />
            {editError && <p className="swarm-field-error">{editError}</p>}
            <div className="swarm-form-actions">
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
        <div className="ct-card swarm-block">
          <div className="ct-card-body">
            <p className="ct-card-title">{UI.swarms.launchPanelTitle}</p>
            <SwarmKickoffPanel
              swarmId={swarm.id}
              swarmName={swarm.name}
              onDone={() => { if (id) void loadSwarm(id); }}
              onLaunched={(runId) => router.push(`/swarms/${swarm.id}/run/${runId}`)}
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
            <div className="swarm-meta-list">
              <div className="swarm-meta-row">
                <span className="swarm-meta-label">{UI.swarms.metaName}</span>
                <p className="swarm-meta-value swarm-meta-value--name">{swarm.name}</p>
              </div>
              {swarm.description && (
                <div className="swarm-meta-row">
                  <span className="swarm-meta-label">{UI.swarms.metaDescription}</span>
                  <p className="swarm-meta-value">{swarm.description}</p>
                </div>
              )}
              <div className="swarm-meta-row">
                <span className="swarm-meta-label">{UI.swarms.metaCreatedAt}</span>
                <p className="swarm-meta-value">{createdAt}</p>
              </div>
            </div>

            {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
              <div className="swarm-meta-tools">
                <p className="ct-card-title">{UI.swarms.toolsTitle}</p>
                <div className="swarm-badge-row">
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
            <div className="swarm-card-list">
              {(swarm.agents ?? []).map((agent, i) => (
                <div key={agent.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{agent.name}</p>
                  <p className="swarm-agent-role">{agent.role}</p>
                  {agent.goal && <p className="swarm-agent-goal">{agent.goal}</p>}
                  {agent.backstory && <p className="swarm-agent-note">{agent.backstory}</p>}
                </div>
              ))}
              {(swarm.agents ?? []).length === 0 && (
                <p className="ct-placeholder">{UI.swarms.agentsEmpty}</p>
              )}
            </div>
          </div>
          <div>
            <p className="swarm-form-section-title">{UI.swarms.tasksCount(swarm.tasks?.length ?? 0)}</p>
            <div className="swarm-card-list">
              {(swarm.tasks ?? []).map((task, i) => (
                <div key={task.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{task.name}</p>
                  {task.description && <p className="swarm-agent-goal">{task.description}</p>}
                  {task.expected_output && (
                    <p className="swarm-agent-note">
                      {UI.swarms.expectedOutputPrefix}{task.expected_output}
                    </p>
                  )}
                  {task.agent_name && (
                    <span className="swarm-tool-badge swarm-agent-task-badge">{task.agent_name}</span>
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
  const [selected, setSelected] = useState<string | null>(null);

  // Sélection par défaut = run le plus récent ; reste valide quand la liste change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (runs.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !runs.some((r) => r.run_id === selected)) {
      setSelected(runs[0].run_id);
    }
  }, [runs, selected]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRelaunch() {
    setLaunching(true);
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reste sur la page : on sélectionne le nouveau run inline (suivi live via RunReport).
      const data = (await res.json()) as { runId?: string };
      if (data.runId) setSelected(data.runId);
      onRefresh();
    } catch {
      // ignore
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="swarm-runs">
      <div className="swarm-runs-bar">
        <p className="ct-card-title swarm-runs-title">{UI.swarms.runsHistory}</p>
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
        <div className="ct-card">
          <div className="ct-card-body">
            <p className="ct-placeholder">{UI.swarms.runsEmpty}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Strip horizontal des runs */}
          <div className="swarm-runs-strip">
            {runs.map((run) => (
              <button
                key={run.run_id}
                type="button"
                className={`swarm-run-card${selected === run.run_id ? " active" : ""}`}
                onClick={() => setSelected(run.run_id)}
              >
                <RunStatusBadge status={run.status} size="sm" />
                <span className="swarm-run-card-date">{dateTimeFr(run.created_at)}</span>
                <span className="swarm-run-card-id">#{run.run_id.slice(0, RUN_ID_SHORT_LEN)}</span>
              </button>
            ))}
          </div>

          {/* Rapport inline du run sélectionné */}
          {selected ? (
            <RunReport key={selected} swarmId={swarmId} runId={selected} />
          ) : (
            <p className="ct-placeholder">{UI.swarms.reportSelectHint}</p>
          )}
        </>
      )}
    </div>
  );
}
