"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { Card, PageHeader, PageStack } from "@/components/cockpit/primitives";
import { TextInput, Textarea } from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";
import type { SwarmAgent, SwarmTask, ArchitectSpec } from "@/lib/swarms/types";

type Tab = "architect" | "manual";

type AgentDraft = { name: string; role: string; goal: string };
type TaskDraft = { name: string; description: string; expected_output: string };

const EMPTY_AGENT: AgentDraft = { name: "", role: "", goal: "" };
const EMPTY_TASK: TaskDraft = { name: "", description: "", expected_output: "" };

const ARCHITECT_TEXTAREA_ROWS = 5;

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
    <PageStack>
      <PageHeader
        kicker={UI.swarms.eyebrow}
        title={UI.swarms.newTitle}
        nav={
          <PageSegmentTabs
            tabs={[
              { id: "architect", label: UI.swarms.tabArchitect },
              { id: "manual", label: UI.swarms.tabManual },
            ]}
            active={tab}
            onSelect={setTab}
          />
        }
      />

      {tab === "architect" && (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
          {/* Colonne gauche : prompt */}
          <Card title={UI.swarms.architectTitle}>
            <div className="flex flex-col gap-3">
              <Textarea
                rows={ARCHITECT_TEXTAREA_ROWS}
                placeholder={UI.swarms.architectPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                type="button"
                className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleGenerateSpec}
                disabled={specLoading || !description.trim()}
              >
                {specLoading ? UI.swarms.architectGenerating : UI.swarms.architectGenerateCta}
              </button>
              {specError && <p className="text-sm text-red-400">{specError}</p>}
            </div>
          </Card>

          {/* Colonne droite : spec générée (structurée) ou indice */}
          {spec ? (
            <Card title={UI.swarms.architectSpecTitle(spec.name)}>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{spec.name}</p>
                  {spec.description && <p className="mt-0.5 text-sm text-slate-400">{spec.description}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {UI.swarms.agentsCount(spec.agents?.length ?? 0)}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {(spec.agents ?? []).map((a, i) => (
                        <div key={a.id ?? i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-sm font-medium text-slate-100">{a.name}</p>
                          {a.role && <p className="mt-0.5 text-xs text-indigo-300">{a.role}</p>}
                          {a.goal && <p className="mt-1 text-xs text-slate-400">{a.goal}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {UI.swarms.tasksCount(spec.tasks?.length ?? 0)}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {(spec.tasks ?? []).map((t, i) => (
                        <div key={t.id ?? i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-sm font-medium text-slate-100">{t.name}</p>
                          {t.description && <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>}
                          {t.expected_output && (
                            <p className="mt-1 text-xs text-slate-500">
                              {UI.swarms.expectedOutputPrefix}{t.expected_output}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-400 select-none">
                    {UI.swarms.architectJsonDetails}
                  </summary>
                  <pre className="mt-2 overflow-x-auto font-mono text-xs text-slate-300">
                    {JSON.stringify(spec, null, 2)}
                  </pre>
                </details>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleCreateFromSpec}
                    disabled={createLoading}
                  >
                    {createLoading ? UI.swarms.architectCreating : UI.swarms.architectCreateCta}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setSpec(null)}
                    disabled={createLoading}
                  >
                    {UI.swarms.architectRegenCta}
                  </button>
                </div>
                {createError && <p className="text-sm text-red-400">{createError}</p>}
              </div>
            </Card>
          ) : (
            // TW+ feedback__empty-states/02-with-dashed-border — adapté thème sombre
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 p-8 text-center">
              <SparklesIcon aria-hidden="true" className="size-10 text-indigo-300" />
              <p className="text-sm text-slate-400">{UI.swarms.architectHint}</p>
            </div>
          )}
        </div>
      )}

      {tab === "manual" && (
        <Card>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {UI.swarms.manualSectionGeneral}
              </h4>
              <TextInput
                type="text"
                placeholder={UI.swarms.manualNamePlaceholder}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <TextInput
                type="text"
                placeholder={UI.swarms.manualDescPlaceholder}
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {UI.swarms.manualSectionAgents}
                </h4>
                <div className="flex flex-col gap-3">
                  {agents.map((agent, i) => (
                    <div key={i} className="relative flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      {agents.length > 1 && (
                        <button
                          type="button"
                          className="absolute top-2 right-2 text-slate-500 hover:text-slate-300"
                          aria-label={UI.swarms.removeAgent}
                          onClick={() => removeAgent(i)}
                        >
                          ×
                        </button>
                      )}
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualAgentNamePlaceholder}
                        value={agent.name}
                        onChange={(e) => updateAgent(i, "name", e.target.value)}
                      />
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualAgentRolePlaceholder}
                        value={agent.role}
                        onChange={(e) => updateAgent(i, "role", e.target.value)}
                      />
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualAgentGoalPlaceholder}
                        value={agent.goal}
                        onChange={(e) => updateAgent(i, "goal", e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="w-fit text-xs font-medium text-indigo-300 hover:text-indigo-200"
                  onClick={addAgent}
                >
                  {UI.swarms.manualAddAgent}
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {UI.swarms.manualSectionTasks}
                </h4>
                <div className="flex flex-col gap-3">
                  {tasks.map((task, i) => (
                    <div key={i} className="relative flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      {tasks.length > 1 && (
                        <button
                          type="button"
                          className="absolute top-2 right-2 text-slate-500 hover:text-slate-300"
                          aria-label={UI.swarms.removeTask}
                          onClick={() => removeTask(i)}
                        >
                          ×
                        </button>
                      )}
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualTaskNamePlaceholder}
                        value={task.name}
                        onChange={(e) => updateTask(i, "name", e.target.value)}
                      />
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualTaskDescPlaceholder}
                        value={task.description}
                        onChange={(e) => updateTask(i, "description", e.target.value)}
                      />
                      <TextInput
                        type="text"
                        placeholder={UI.swarms.manualTaskOutputPlaceholder}
                        value={task.expected_output}
                        onChange={(e) => updateTask(i, "expected_output", e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="w-fit text-xs font-medium text-indigo-300 hover:text-indigo-200"
                  onClick={addTask}
                >
                  {UI.swarms.manualAddTask}
                </button>
              </div>
            </div>

            {manualError && <p className="text-sm text-red-400">{manualError}</p>}

            <button
              type="button"
              className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleManualCreate}
              disabled={manualLoading}
            >
              {manualLoading ? UI.swarms.manualCreating : UI.swarms.manualCreateCta}
            </button>
          </div>
        </Card>
      )}
    </PageStack>
  );
}
