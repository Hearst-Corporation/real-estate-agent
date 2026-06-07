"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { Caption, PageHeader, PageStack, SubsectionTitle } from "@/components/cockpit/primitives";
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
    return <p className="ct-pad-lg ct-muted-text">{UI.common.loading}</p>;
  }

  if (error || !swarm) {
    return (
      <div className="ct-pad-lg">
        <p className="ct-error-danger ct-mb-sm">{error ?? UI.swarms.notFound}</p>
        <Link href="/swarms" className="ct-btn ct-btn-secondary">
          {UI.swarms.backToSwarms}
        </Link>
      </div>
    );
  }

  const createdAt = dateFr(swarm.created_at);

  return (
    <PageStack>
      <PageHeader
        kicker={
          <>
            <Link href="/swarms" className="swarm-crumb">
              {UI.nav.swarms}
            </Link>{" "}
            /
          </>
        }
        title={swarm.name}
        meta={
          <span className={`swarm-status-badge ${swarm.is_active ? "swarm-status-done" : "swarm-status-failed"}`}>
            {swarm.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}
          </span>
        }
        nav={
          <PageSegmentTabs
            tabs={[
              { id: "config", label: UI.swarms.configTab },
              { id: "agents", label: UI.swarms.agentsTab },
              { id: "runs", label: UI.swarms.runsTab },
            ]}
            active={tab}
            onSelect={setTab}
          />
        }
        action={
          <div className="ct-quick-actions">
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
              <button type="button" className="ct-btn ct-btn-danger" onClick={() => setDeleteConfirm(true)}>
                {UI.swarms.deleteBtn}
              </button>
            ) : (
              <div className="ct-quick-actions">
                <Caption as="span">{UI.swarms.confirmDelete}</Caption>
                <button type="button" className="ct-btn ct-btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading ? UI.common.busy : UI.swarms.confirmYes}
                </button>
                <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setDeleteConfirm(false)}>
                  {UI.swarms.confirmNo}
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* Inline edit form */}
      {editing && (
        <div className="ct-card ct-mb-md">
          <div className="ct-card-body">
            <div className="ct-card-title">{UI.swarms.editTitle}</div>
            <input
              className="crm-input ct-mb-sm"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={UI.swarms.manualSectionGeneral}
            />
            <input
              className="crm-input ct-mb-sm"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={UI.swarms.manualDescPlaceholder}
            />
            {editError && <p className="ct-error-danger ct-mb-sm">{editError}</p>}
            <div className="ct-inline-actions">
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
        <div className="ct-card ct-mb-md">
          <div className="ct-card-body">
            <div className="ct-card-title">{UI.swarms.launchPanelTitle}</div>
            <SwarmKickoffPanel
              swarmId={swarm.id}
              swarmName={swarm.name}
              onDone={() => { if (id) void loadSwarm(id); }}
            />
          </div>
        </div>
      )}

      {/* Tab: Configuration */}
      {tab === "config" && (
        <div className="ct-card">
          <div className="ct-card-body">
            <SubsectionTitle as="div">{UI.swarms.manualSectionGeneral}</SubsectionTitle>
            <div className="ct-col-stack-sm">
              <div>
                <span className="swarm-meta-label">{UI.swarms.metaName}</span>
                <p className="swarm-meta-value-lg">{swarm.name}</p>
              </div>
              {swarm.description && (
                <div>
                  <span className="swarm-meta-label">{UI.swarms.metaDescription}</span>
                  <p className="swarm-meta-value">{swarm.description}</p>
                </div>
              )}
              <div>
                <span className="swarm-meta-label">{UI.swarms.metaCreatedAt}</span>
                <p className="swarm-meta-value">{createdAt}</p>
              </div>
            </div>

            {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
              <div className="ct-mt-sm">
                <div className="ct-card-title">{UI.swarms.toolsTitle}</div>
                <div className="ct-quick-actions">
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
            <SubsectionTitle as="div">{UI.swarms.agentsCount(swarm.agents?.length ?? 0)}</SubsectionTitle>
            <div className="ct-col-stack-sm">
              {(swarm.agents ?? []).map((agent, i) => (
                <div key={agent.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{agent.name}</p>
                  <p className="swarm-agent-role">{agent.role}</p>
                  {agent.goal && <p className="swarm-agent-goal">{agent.goal}</p>}
                  {agent.backstory && (
                    <p className="swarm-meta-backstory">{agent.backstory}</p>
                  )}
                </div>
              ))}
              {(swarm.agents ?? []).length === 0 && (
                <p className="ct-placeholder">{UI.swarms.agentsEmpty}</p>
              )}
            </div>
          </div>
          <div>
            <SubsectionTitle as="div">{UI.swarms.tasksCount(swarm.tasks?.length ?? 0)}</SubsectionTitle>
            <div className="ct-col-stack-sm">
              {(swarm.tasks ?? []).map((task, i) => (
                <div key={task.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{task.name}</p>
                  {task.description && <p className="swarm-agent-goal">{task.description}</p>}
                  {task.expected_output && (
                    <p className="swarm-meta-backstory">
                      {UI.swarms.expectedOutputPrefix}{task.expected_output}
                    </p>
                  )}
                  {task.agent_name && (
                    <span className="swarm-tool-badge swarm-task-agent-badge">
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
    </PageStack>
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
        <div className="ct-row-between ct-mb-md">
          <div className="ct-card-title">{UI.swarms.runsHistory}</div>
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
                  <Caption as="span">{date}</Caption>
                  <Link
                    href={`/swarms/${swarmId}/run/${run.run_id}`}
                    className="ct-link-btn-sm ct-btn ct-btn-secondary"
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
