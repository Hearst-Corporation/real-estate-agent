"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import type { SwarmAgent, SwarmTask, ArchitectSpec } from "@/lib/swarms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Tab = "architect" | "manual";

type AgentDraft = { name: string; role: string; goal: string };
type TaskDraft = { name: string; description: string; expected_output: string };

const EMPTY_AGENT: AgentDraft = { name: "", role: "", goal: "" };
const EMPTY_TASK: TaskDraft = { name: "", description: "", expected_output: "" };

const ARCHITECT_TEXTAREA_ROWS = 5;

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
      {children}
    </div>
  );
}

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
          <SectionCard>
            <Subheading level={2} className="mb-3">{UI.swarms.architectTitle}</Subheading>
            <div className="flex flex-col gap-3">
              <Field>
                <Label className="sr-only">{UI.swarms.architectTitle}</Label>
                <Textarea
                  rows={ARCHITECT_TEXTAREA_ROWS}
                  placeholder={UI.swarms.architectPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Button
                color="indigo"
                className="w-fit"
                onClick={handleGenerateSpec}
                disabled={specLoading || !description.trim()}
              >
                {specLoading ? UI.swarms.architectGenerating : UI.swarms.architectGenerateCta}
              </Button>
              {specError && (
                <ErrorMessage className="[&>[data-slot=error]]:mt-0">{specError}</ErrorMessage>
              )}
            </div>
          </SectionCard>

          {/* Colonne droite : spec générée (structurée) ou indice */}
          {spec ? (
            <SectionCard>
              <Subheading level={2} className="mb-3">
                {UI.swarms.architectSpecTitle(spec.name)}
              </Subheading>
              <div className="flex flex-col gap-4">
                <div>
                  <Text className="font-semibold text-zinc-950 dark:text-white">{spec.name}</Text>
                  {spec.description && <Text className="mt-0.5">{spec.description}</Text>}
                </div>

                <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
                  <div>
                    <Subheading level={3} className="mb-2 text-zinc-500 uppercase dark:text-zinc-400">
                      {UI.swarms.agentsCount(spec.agents?.length ?? 0)}
                    </Subheading>
                    <div className="flex flex-col gap-2">
                      {(spec.agents ?? []).map((a, i) => (
                        <div key={a.id ?? i} className="rounded-lg border border-zinc-950/10 bg-white/[0.02] p-3 dark:border-white/10">
                          <Text className="font-medium text-zinc-950 dark:text-white">{a.name}</Text>
                          {a.role && <Text className="mt-0.5 text-indigo-600 dark:text-indigo-400">{a.role}</Text>}
                          {a.goal && <Text className="mt-1">{a.goal}</Text>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Subheading level={3} className="mb-2 text-zinc-500 uppercase dark:text-zinc-400">
                      {UI.swarms.tasksCount(spec.tasks?.length ?? 0)}
                    </Subheading>
                    <div className="flex flex-col gap-2">
                      {(spec.tasks ?? []).map((t, i) => (
                        <div key={t.id ?? i} className="rounded-lg border border-zinc-950/10 bg-white/[0.02] p-3 dark:border-white/10">
                          <Text className="font-medium text-zinc-950 dark:text-white">{t.name}</Text>
                          {t.description && <Text className="mt-0.5">{t.description}</Text>}
                          {t.expected_output && (
                            <Text className="mt-1">
                              {UI.swarms.expectedOutputPrefix}{t.expected_output}
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <details className="rounded-lg border border-zinc-950/10 bg-white/[0.02] p-3 dark:border-white/10">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 select-none dark:text-zinc-400">
                    {UI.swarms.architectJsonDetails}
                  </summary>
                  <pre className="mt-2 overflow-x-auto font-mono text-xs text-zinc-600 dark:text-zinc-300">
                    {JSON.stringify(spec, null, 2)}
                  </pre>
                </details>

                <div className="flex flex-wrap gap-2">
                  <Button color="indigo" onClick={handleCreateFromSpec} disabled={createLoading}>
                    {createLoading ? UI.swarms.architectCreating : UI.swarms.architectCreateCta}
                  </Button>
                  <Button outline onClick={() => setSpec(null)} disabled={createLoading}>
                    {UI.swarms.architectRegenCta}
                  </Button>
                </div>
                {createError && (
                  <ErrorMessage className="[&>[data-slot=error]]:mt-0">{createError}</ErrorMessage>
                )}
              </div>
            </SectionCard>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-950/15 p-8 text-center dark:border-white/15">
              <SparklesIcon aria-hidden="true" className="size-10 text-indigo-500 dark:text-indigo-400" />
              <Text>{UI.swarms.architectHint}</Text>
            </div>
          )}
        </div>
      )}

      {tab === "manual" && (
        <SectionCard>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Subheading level={3} className="text-zinc-500 uppercase dark:text-zinc-400">
                {UI.swarms.manualSectionGeneral}
              </Subheading>
              <Field>
                <Label className="sr-only">{UI.swarms.manualNamePlaceholder}</Label>
                <Input
                  type="text"
                  placeholder={UI.swarms.manualNamePlaceholder}
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </Field>
              <Field>
                <Label className="sr-only">{UI.swarms.manualDescPlaceholder}</Label>
                <Input
                  type="text"
                  placeholder={UI.swarms.manualDescPlaceholder}
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Subheading level={3} className="text-zinc-500 uppercase dark:text-zinc-400">
                  {UI.swarms.manualSectionAgents}
                </Subheading>
                <div className="flex flex-col gap-3">
                  {agents.map((agent, i) => (
                    <div key={i} className="relative flex flex-col gap-2 rounded-lg border border-zinc-950/10 bg-white/[0.02] p-3 dark:border-white/10">
                      {agents.length > 1 && (
                        <div className="absolute top-1 right-1">
                          <Button
                            plain
                            aria-label={UI.swarms.removeAgent}
                            onClick={() => removeAgent(i)}
                          >
                            ×
                          </Button>
                        </div>
                      )}
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualAgentNamePlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualAgentNamePlaceholder}
                          value={agent.name}
                          onChange={(e) => updateAgent(i, "name", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualAgentRolePlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualAgentRolePlaceholder}
                          value={agent.role}
                          onChange={(e) => updateAgent(i, "role", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualAgentGoalPlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualAgentGoalPlaceholder}
                          value={agent.goal}
                          onChange={(e) => updateAgent(i, "goal", e.target.value)}
                        />
                      </Field>
                    </div>
                  ))}
                </div>
                <Button plain className="w-fit" onClick={addAgent}>
                  {UI.swarms.manualAddAgent}
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                <Subheading level={3} className="text-zinc-500 uppercase dark:text-zinc-400">
                  {UI.swarms.manualSectionTasks}
                </Subheading>
                <div className="flex flex-col gap-3">
                  {tasks.map((task, i) => (
                    <div key={i} className="relative flex flex-col gap-2 rounded-lg border border-zinc-950/10 bg-white/[0.02] p-3 dark:border-white/10">
                      {tasks.length > 1 && (
                        <div className="absolute top-1 right-1">
                          <Button
                            plain
                            aria-label={UI.swarms.removeTask}
                            onClick={() => removeTask(i)}
                          >
                            ×
                          </Button>
                        </div>
                      )}
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualTaskNamePlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualTaskNamePlaceholder}
                          value={task.name}
                          onChange={(e) => updateTask(i, "name", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualTaskDescPlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualTaskDescPlaceholder}
                          value={task.description}
                          onChange={(e) => updateTask(i, "description", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label className="sr-only">{UI.swarms.manualTaskOutputPlaceholder}</Label>
                        <Input
                          type="text"
                          placeholder={UI.swarms.manualTaskOutputPlaceholder}
                          value={task.expected_output}
                          onChange={(e) => updateTask(i, "expected_output", e.target.value)}
                        />
                      </Field>
                    </div>
                  ))}
                </div>
                <Button plain className="w-fit" onClick={addTask}>
                  {UI.swarms.manualAddTask}
                </Button>
              </div>
            </div>

            {manualError && (
              <ErrorMessage className="[&>[data-slot=error]]:mt-0">{manualError}</ErrorMessage>
            )}

            <Button color="indigo" className="w-fit" onClick={handleManualCreate} disabled={manualLoading}>
              {manualLoading ? UI.swarms.manualCreating : UI.swarms.manualCreateCta}
            </Button>
          </div>
        </SectionCard>
      )}
    </PageStack>
  );
}
