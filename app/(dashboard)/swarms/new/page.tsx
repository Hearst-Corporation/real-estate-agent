"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import type { SwarmAgent, SwarmTask, ArchitectSpec } from "@/lib/swarms/types";

type Tab = "architect" | "manual";

type AgentDraft = { name: string; role: string; goal: string };
type TaskDraft = { name: string; description: string; expected_output: string };

const EMPTY_AGENT: AgentDraft = { name: "", role: "", goal: "" };
const EMPTY_TASK: TaskDraft = { name: "", description: "", expected_output: "" };

export default function NewSwarmPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("architect");

  // ── Architect tab ──────────────────────────────────────────────────────────
  const [description, setDescription] = useState("");
  const [specLoading, setSpecLoading] = useState(false);
  const [spec, setSpec] = useState<ArchitectSpec | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleGenerateSpec() {
    if (!description.trim()) return;
    setSpecLoading(true);
    setSpecError(null);
    setSpec(null);
    try {
      const res = await fetch("/api/swarms/architect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) throw new Error(UI.common.httpError(res.status));
      const data = (await res.json()) as { spec: ArchitectSpec };
      setSpec(data.spec);
    } catch (err) {
      setSpecError(err instanceof Error ? err.message : UI.swarms.generateError);
    } finally {
      setSpecLoading(false);
    }
  }

  async function handleCreateFromSpec() {
    if (!spec) return;
    if (!spec.agents?.length || !spec.tasks?.length) {
      setCreateError(UI.swarms.architectSpecError);
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/swarms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(spec),
      });
      if (!res.ok) throw new Error(UI.common.httpError(res.status));
      const data = (await res.json()) as { item: { id: string } };
      router.push(`/swarms/${data.item.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : UI.swarms.createError);
    } finally {
      setCreateLoading(false);
    }
  }

  // ── Manual tab ─────────────────────────────────────────────────────────────
  const [manualName, setManualName] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [agents, setAgents] = useState<AgentDraft[]>([{ ...EMPTY_AGENT }]);
  const [tasks, setTasks] = useState<TaskDraft[]>([{ ...EMPTY_TASK }]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  function updateAgent(i: number, field: keyof AgentDraft, value: string) {
    setAgents((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));
  }
  function addAgent() {
    setAgents((prev) => [...prev, { ...EMPTY_AGENT }]);
  }
  function removeAgent(i: number) {
    setAgents((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateTask(i: number, field: keyof TaskDraft, value: string) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }
  function addTask() {
    setTasks((prev) => [...prev, { ...EMPTY_TASK }]);
  }
  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleManualCreate() {
    if (!manualName.trim()) {
      setManualError(UI.swarms.manualNameRequired);
      return;
    }
    setManualLoading(true);
    setManualError(null);
    try {
      const payload = {
        name: manualName.trim(),
        description: manualDesc.trim() || undefined,
        agents: agents.filter((a) => a.name.trim()) as SwarmAgent[],
        tasks: tasks.filter((t) => t.name.trim()) as SwarmTask[],
      };
      const res = await fetch("/api/swarms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(UI.common.httpError(res.status));
      const data = (await res.json()) as { item: { id: string } };
      router.push(`/swarms/${data.item.id}`);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : UI.swarms.createError);
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <>
      <p className="ct-eyebrow">{UI.swarms.eyebrow}</p>
      <h1 className="ct-title">{UI.swarms.newTitle}</h1>

      <div className="swarm-tabs">
        <button
          type="button"
          className={`swarm-tab-btn${tab === "architect" ? " active" : ""}`}
          onClick={() => setTab("architect")}
        >
          {UI.swarms.tabArchitect}
        </button>
        <button
          type="button"
          className={`swarm-tab-btn${tab === "manual" ? " active" : ""}`}
          onClick={() => setTab("manual")}
        >
          {UI.swarms.tabManual}
        </button>
      </div>

      {tab === "architect" && (
        <div className="ct-card" style={{ maxWidth: 720, width: "100%" }}>
          <p className="ct-card-title">{UI.swarms.architectTitle}</p>
          <div className="ct-card-body">
            <textarea
              className="crm-input"
              rows={5}
              placeholder={UI.swarms.architectPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", resize: "vertical", marginBottom: "var(--ct-space-md)" }}
            />
            <button
              type="button"
              className="ct-btn ct-btn-primary"
              onClick={handleGenerateSpec}
              disabled={specLoading || !description.trim()}
            >
              {specLoading ? UI.swarms.architectGenerating : UI.swarms.architectGenerateCta}
            </button>
            {specError && (
              <p style={{ color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-sm)", marginTop: "var(--ct-space-sm)" }}>
                {specError}
              </p>
            )}
          </div>

          {spec && (
            <div className="ct-card-body" style={{ marginTop: "var(--ct-space-md)" }}>
              <p className="ct-card-title">{UI.swarms.architectSpecTitle(spec.name)}</p>
              <pre className="swarm-spec-preview">{JSON.stringify(spec, null, 2)}</pre>
              <div style={{ marginTop: "var(--ct-space-md)", display: "flex", gap: "var(--ct-space-sm)" }}>
                <button
                  type="button"
                  className="ct-btn ct-btn-primary"
                  onClick={handleCreateFromSpec}
                  disabled={createLoading}
                >
                  {createLoading ? UI.swarms.architectCreating : UI.swarms.architectCreateCta}
                </button>
                <button
                  type="button"
                  className="ct-btn ct-btn-secondary"
                  onClick={() => setSpec(null)}
                  disabled={createLoading}
                >
                  {UI.swarms.architectRegenCta}
                </button>
              </div>
              {createError && (
                <p style={{ color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-sm)", marginTop: "var(--ct-space-sm)" }}>
                  {createError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "manual" && (
        <div className="ct-card" style={{ maxWidth: 720, width: "100%" }}>
          <div className="ct-card-body">
            <div className="swarm-form-section">
              <p className="swarm-form-section-title">{UI.swarms.manualSectionGeneral}</p>
              <input
                className="crm-input"
                type="text"
                placeholder={UI.swarms.manualNamePlaceholder}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                style={{ marginBottom: "var(--ct-space-sm)" }}
              />
              <input
                className="crm-input"
                type="text"
                placeholder={UI.swarms.manualDescPlaceholder}
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
              />
            </div>

            <div className="swarm-form-section">
              <p className="swarm-form-section-title">{UI.swarms.manualSectionAgents}</p>
              <div className="swarm-dynamic-list">
                {agents.map((agent, i) => (
                  <div key={i} className="swarm-dynamic-item">
                    {agents.length > 1 && (
                      <button type="button" className="swarm-dynamic-remove" onClick={() => removeAgent(i)}>
                        ×
                      </button>
                    )}
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualAgentNamePlaceholder}
                      value={agent.name}
                      onChange={(e) => updateAgent(i, "name", e.target.value)}
                      style={{ marginBottom: "var(--ct-space-xs)" }}
                    />
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualAgentRolePlaceholder}
                      value={agent.role}
                      onChange={(e) => updateAgent(i, "role", e.target.value)}
                      style={{ marginBottom: "var(--ct-space-xs)" }}
                    />
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualAgentGoalPlaceholder}
                      value={agent.goal}
                      onChange={(e) => updateAgent(i, "goal", e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <button type="button" className="swarm-add-btn" onClick={addAgent}>
                {UI.swarms.manualAddAgent}
              </button>
            </div>

            <div className="swarm-form-section">
              <p className="swarm-form-section-title">{UI.swarms.manualSectionTasks}</p>
              <div className="swarm-dynamic-list">
                {tasks.map((task, i) => (
                  <div key={i} className="swarm-dynamic-item">
                    {tasks.length > 1 && (
                      <button type="button" className="swarm-dynamic-remove" onClick={() => removeTask(i)}>
                        ×
                      </button>
                    )}
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualTaskNamePlaceholder}
                      value={task.name}
                      onChange={(e) => updateTask(i, "name", e.target.value)}
                      style={{ marginBottom: "var(--ct-space-xs)" }}
                    />
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualTaskDescPlaceholder}
                      value={task.description}
                      onChange={(e) => updateTask(i, "description", e.target.value)}
                      style={{ marginBottom: "var(--ct-space-xs)" }}
                    />
                    <input
                      className="crm-input"
                      type="text"
                      placeholder={UI.swarms.manualTaskOutputPlaceholder}
                      value={task.expected_output}
                      onChange={(e) => updateTask(i, "expected_output", e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <button type="button" className="swarm-add-btn" onClick={addTask}>
                {UI.swarms.manualAddTask}
              </button>
            </div>

            {manualError && (
              <p style={{ color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-sm)", marginBottom: "var(--ct-space-sm)" }}>
                {manualError}
              </p>
            )}

            <button
              type="button"
              className="ct-btn ct-btn-primary"
              onClick={handleManualCreate}
              disabled={manualLoading}
            >
              {manualLoading ? UI.swarms.manualCreating : UI.swarms.manualCreateCta}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
