"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      const swarmData = (await swarmRes.json()) as Swarm;
      setSwarm(swarmData);
      setEditName(swarmData.name);
      setEditDesc(swarmData.description ?? "");
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as SwarmRun[];
        setRuns(runsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
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
      const updated = (await res.json()) as Swarm;
      setSwarm(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
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
        Chargement…
      </div>
    );
  }

  if (error || !swarm) {
    return (
      <div style={{ padding: "var(--ct-space-lg)" }}>
        <p style={{ color: "var(--ct-text-danger)" }}>{error ?? "Swarm introuvable."}</p>
        <Link href="/swarms" className="ct-btn ct-btn-secondary" style={{ marginTop: "var(--ct-space-md)", display: "inline-block" }}>
          Retour aux swarms
        </Link>
      </div>
    );
  }

  const createdAt = swarm.created_at
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(swarm.created_at))
    : "—";

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ct-space-md)", marginBottom: "var(--ct-space-lg)", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p className="ct-eyebrow">
            <Link href="/swarms" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
              Swarms
            </Link>{" "}
            /
          </p>
          <h1 className="ct-title" style={{ marginBottom: "var(--ct-space-xs)" }}>
            {swarm.name}
          </h1>
          <span className={`swarm-status-badge ${swarm.is_active ? "swarm-status-done" : "swarm-status-failed"}`}>
            {swarm.is_active ? "Actif" : "Inactif"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--ct-space-sm)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ct-btn ct-btn-primary"
            onClick={() => setShowKickoff((v) => !v)}
          >
            {showKickoff ? "Masquer" : "Lancer"}
          </button>
          <button
            type="button"
            className="ct-btn ct-btn-secondary"
            onClick={() => { setEditing((v) => !v); setEditError(null); }}
          >
            Éditer
          </button>
          {!deleteConfirm ? (
            <button
              type="button"
              className="ct-btn"
              style={{ color: "var(--ct-text-danger)", borderColor: "var(--ct-text-danger)" }}
              onClick={() => setDeleteConfirm(true)}
            >
              Supprimer
            </button>
          ) : (
            <div style={{ display: "flex", gap: "var(--ct-space-xs)", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ct-text-muted)" }}>Confirmer ?</span>
              <button
                type="button"
                className="ct-btn"
                style={{ color: "var(--ct-text-danger)" }}
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? "…" : "Oui"}
              </button>
              <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setDeleteConfirm(false)}>
                Non
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">Modifier le swarm</p>
            <input
              className="crm-input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nom"
              style={{ marginBottom: "var(--ct-space-sm)" }}
            />
            <input
              className="crm-input"
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              style={{ marginBottom: "var(--ct-space-sm)" }}
            />
            {editError && (
              <p style={{ color: "var(--ct-text-danger)", fontSize: 12, marginBottom: "var(--ct-space-sm)" }}>
                {editError}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--ct-space-sm)" }}>
              <button type="button" className="ct-btn ct-btn-primary" onClick={handleEdit} disabled={editLoading}>
                {editLoading ? "Sauvegarde…" : "Sauvegarder"}
              </button>
              <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setEditing(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kickoff panel */}
      {showKickoff && (
        <div className="ct-card" style={{ marginBottom: "var(--ct-space-md)" }}>
          <div className="ct-card-body">
            <p className="ct-card-title">Lancer le swarm</p>
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
          Configuration
        </button>
        <button type="button" className={`swarm-tab-btn${tab === "agents" ? " active" : ""}`} onClick={() => setTab("agents")}>
          Agents & Tâches
        </button>
        <button type="button" className={`swarm-tab-btn${tab === "runs" ? " active" : ""}`} onClick={() => setTab("runs")}>
          Runs
        </button>
      </div>

      {/* Tab: Configuration */}
      {tab === "config" && (
        <div className="ct-card">
          <div className="ct-card-body">
            <p className="ct-card-title">Informations générales</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-xs)" }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--ct-text-muted)" }}>Nom</span>
                <p style={{ fontSize: 14, color: "var(--ct-text-primary)", margin: 0 }}>{swarm.name}</p>
              </div>
              {swarm.description && (
                <div>
                  <span style={{ fontSize: 11, color: "var(--ct-text-muted)" }}>Description</span>
                  <p style={{ fontSize: 13, color: "var(--ct-text-body)", margin: 0 }}>{swarm.description}</p>
                </div>
              )}
              <div>
                <span style={{ fontSize: 11, color: "var(--ct-text-muted)" }}>Créé le</span>
                <p style={{ fontSize: 13, color: "var(--ct-text-body)", margin: 0 }}>{createdAt}</p>
              </div>
            </div>

            {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
              <div style={{ marginTop: "var(--ct-space-md)" }}>
                <p className="ct-card-title">Tools</p>
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
            <p className="swarm-form-section-title">Agents ({swarm.agents?.length ?? 0})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
              {(swarm.agents ?? []).map((agent, i) => (
                <div key={agent.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{agent.name}</p>
                  <p className="swarm-agent-role">{agent.role}</p>
                  {agent.goal && <p className="swarm-agent-goal">{agent.goal}</p>}
                  {agent.backstory && (
                    <p style={{ fontSize: 11, color: "var(--ct-text-muted)", marginTop: 4 }}>{agent.backstory}</p>
                  )}
                </div>
              ))}
              {(swarm.agents ?? []).length === 0 && (
                <p className="ct-placeholder">Aucun agent configuré.</p>
              )}
            </div>
          </div>
          <div>
            <p className="swarm-form-section-title">Tâches ({swarm.tasks?.length ?? 0})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
              {(swarm.tasks ?? []).map((task, i) => (
                <div key={task.id ?? i} className="swarm-agent-card">
                  <p className="swarm-agent-name">{task.name}</p>
                  {task.description && <p className="swarm-agent-goal">{task.description}</p>}
                  {task.expected_output && (
                    <p style={{ fontSize: 11, color: "var(--ct-text-muted)", marginTop: 4 }}>
                      Résultat attendu : {task.expected_output}
                    </p>
                  )}
                  {task.agent_name && (
                    <span className="swarm-tool-badge" style={{ marginTop: 4, display: "inline-block" }}>
                      {task.agent_name}
                    </span>
                  )}
                </div>
              ))}
              {(swarm.tasks ?? []).length === 0 && (
                <p className="ct-placeholder">Aucune tâche configurée.</p>
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
          <p className="ct-card-title">Historique des runs</p>
          <button
            type="button"
            className="ct-btn ct-btn-primary"
            onClick={handleRelaunch}
            disabled={launching}
          >
            {launching ? "Lancement…" : "Relancer"}
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="ct-placeholder">Aucun run pour ce swarm.</p>
        ) : (
          <div>
            {runs.map((run) => {
              const date = run.created_at
                ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.created_at))
                : "—";
              return (
                <div key={run.run_id} className="swarm-run-row">
                  <span className="swarm-run-id">{run.run_id}</span>
                  <RunStatusBadge status={run.status} size="sm" />
                  <span style={{ fontSize: 12, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>{date}</span>
                  <Link
                    href={`/swarms/${swarmId}/run/${run.run_id}`}
                    className="ct-btn ct-btn-secondary"
                    style={{ fontSize: 11, padding: "2px 8px", textDecoration: "none", display: "inline-block" }}
                  >
                    Voir
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
