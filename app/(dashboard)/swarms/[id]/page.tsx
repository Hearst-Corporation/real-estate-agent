"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { Badge, Caption, Card, PageHeader, PageStack, SubsectionTitle } from "@/components/cockpit/primitives";
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
    return <p className="p-8 text-sm text-slate-500">{UI.common.loading}</p>;
  }

  if (error || !swarm) {
    return (
      <div className="p-8">
        <p className="mb-3 text-sm text-red-400">{error ?? UI.swarms.notFound}</p>
        <Link
          href="/swarms"
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
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
            <Link href="/swarms" className="text-indigo-300 hover:text-indigo-200">
              {UI.nav.swarms}
            </Link>{" "}
            /
          </>
        }
        title={swarm.name}
        meta={<Badge>{swarm.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}</Badge>}
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
              onClick={() => setShowKickoff((v) => !v)}
            >
              {showKickoff ? UI.swarms.hideBtn : UI.swarms.launchBtn}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
              onClick={() => { setEditing((v) => !v); setEditError(null); }}
            >
              {UI.swarms.editBtn}
            </button>
            {!deleteConfirm ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-400/20"
                onClick={() => setDeleteConfirm(true)}
              >
                {UI.swarms.deleteBtn}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Caption as="span">{UI.swarms.confirmDelete}</Caption>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? UI.common.busy : UI.swarms.confirmYes}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                  onClick={() => setDeleteConfirm(false)}
                >
                  {UI.swarms.confirmNo}
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* Inline edit form */}
      {editing && (
        <Card title={UI.swarms.editTitle}>
          <div className="flex flex-col gap-3">
            <input
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={UI.swarms.manualSectionGeneral}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={UI.swarms.manualDescPlaceholder}
            />
            {editError && <p className="text-sm text-red-400">{editError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleEdit}
                disabled={editLoading}
              >
                {editLoading ? UI.swarms.editSaving : UI.swarms.editSave}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                onClick={() => setEditing(false)}
              >
                {UI.swarms.editCancel}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Kickoff panel */}
      {showKickoff && (
        <Card title={UI.swarms.launchPanelTitle}>
          <SwarmKickoffPanel
            swarmId={swarm.id}
            swarmName={swarm.name}
            onDone={() => { if (id) void loadSwarm(id); }}
          />
        </Card>
      )}

      {/* Tab: Configuration */}
      {tab === "config" && (
        <Card>
          <SubsectionTitle as="div">{UI.swarms.manualSectionGeneral}</SubsectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {UI.swarms.metaName}
              </span>
              <p className="mt-0.5 text-base font-semibold text-slate-100">{swarm.name}</p>
            </div>
            {swarm.description && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {UI.swarms.metaDescription}
                </span>
                <p className="mt-0.5 text-sm text-slate-300">{swarm.description}</p>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {UI.swarms.metaCreatedAt}
              </span>
              <p className="mt-0.5 text-sm text-slate-300">{createdAt}</p>
            </div>
          </div>

          {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {UI.swarms.toolsTitle}
              </div>
              <div className="flex flex-wrap gap-2">
                {swarm.tool_bindings.map((tb, i) => (
                  <Badge key={i}>{tb.tool_id}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Agents & Tasks */}
      {tab === "agents" && (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
          <div>
            <SubsectionTitle as="div">{UI.swarms.agentsCount(swarm.agents?.length ?? 0)}</SubsectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              {(swarm.agents ?? []).map((agent, i) => (
                <div key={agent.id ?? i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-sm font-medium text-slate-100">{agent.name}</p>
                  <p className="mt-0.5 text-xs text-indigo-300">{agent.role}</p>
                  {agent.goal && <p className="mt-1 text-xs text-slate-400">{agent.goal}</p>}
                  {agent.backstory && (
                    <p className="mt-1 text-xs text-slate-500">{agent.backstory}</p>
                  )}
                </div>
              ))}
              {(swarm.agents ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">{UI.swarms.agentsEmpty}</p>
              )}
            </div>
          </div>
          <div>
            <SubsectionTitle as="div">{UI.swarms.tasksCount(swarm.tasks?.length ?? 0)}</SubsectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              {(swarm.tasks ?? []).map((task, i) => (
                <div key={task.id ?? i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-sm font-medium text-slate-100">{task.name}</p>
                  {task.description && <p className="mt-0.5 text-xs text-slate-400">{task.description}</p>}
                  {task.expected_output && (
                    <p className="mt-1 text-xs text-slate-500">
                      {UI.swarms.expectedOutputPrefix}{task.expected_output}
                    </p>
                  )}
                  {task.agent_name && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200">
                      {task.agent_name}
                    </span>
                  )}
                </div>
              ))}
              {(swarm.tasks ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">{UI.swarms.tasksEmpty}</p>
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
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {UI.swarms.runsHistory}
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleRelaunch}
          disabled={launching}
        >
          {launching ? UI.swarms.runsRelaunching : UI.swarms.runsRelaunch}
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{UI.swarms.runsEmpty}</p>
      ) : (
        <div className="flex flex-col divide-y divide-white/5">
          {runs.map((run) => {
            const date = dateTimeFr(run.created_at);
            return (
              <div key={run.run_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-mono text-xs text-slate-500">{run.run_id}</span>
                <RunStatusBadge status={run.status} size="sm" />
                <Caption as="span">{date}</Caption>
                <Link
                  href={`/swarms/${swarmId}/run/${run.run_id}`}
                  className="ml-auto inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                >
                  {UI.swarms.runsView}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
