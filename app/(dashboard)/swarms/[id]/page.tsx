"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PlayCircleIcon } from "@heroicons/react/24/outline";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { dateFr, dateTimeFr } from "@/lib/crm/format";
import RunStatusBadge from "@/components/swarms/RunStatusBadge";
import SwarmKickoffPanel from "@/components/swarms/SwarmKickoffPanel";
import type { Swarm, SwarmRun } from "@/lib/swarms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "@/components/ui/heading";
import { Text, TextLink } from "@/components/ui/text";
import { DescriptionList, DescriptionTerm, DescriptionDetails } from "@/components/ui/description-list";

type Tab = "config" | "agents" | "runs";

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
      {children}
    </div>
  );
}

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
    return <Text className="p-8">{UI.common.loading}</Text>;
  }

  if (error || !swarm) {
    return (
      <div className="p-8">
        <ErrorMessage className="mb-3 [&>[data-slot=error]]:mt-0">{error ?? UI.swarms.notFound}</ErrorMessage>
        <Button href="/swarms" outline>
          {UI.swarms.backToSwarms}
        </Button>
      </div>
    );
  }

  const createdAt = dateFr(swarm.created_at);

  return (
    <PageStack>
      <PageHeader
        kicker={
          <>
            <TextLink href="/swarms">{UI.nav.swarms}</TextLink> /
          </>
        }
        title={swarm.name}
        meta={
          <Badge color={swarm.is_active ? "indigo" : "zinc"}>
            {swarm.is_active ? UI.swarms.statusActive : UI.swarms.statusInactive}
          </Badge>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button color="indigo" onClick={() => setShowKickoff((v) => !v)}>
              {showKickoff ? UI.swarms.hideBtn : UI.swarms.launchBtn}
            </Button>
            <Button outline onClick={() => { setEditing((v) => !v); setEditError(null); }}>
              {UI.swarms.editBtn}
            </Button>
            {!deleteConfirm ? (
              <Button outline onClick={() => setDeleteConfirm(true)}>
                {UI.swarms.deleteBtn}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Text>{UI.swarms.confirmDelete}</Text>
                <Button outline onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading ? UI.common.busy : UI.swarms.confirmYes}
                </Button>
                <Button plain onClick={() => setDeleteConfirm(false)}>
                  {UI.swarms.confirmNo}
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Inline edit form */}
      {editing && (
        <SectionCard>
          <Subheading level={2} className="mb-3">{UI.swarms.editTitle}</Subheading>
          <div className="flex flex-col gap-3">
            <Field>
              <Label className="sr-only">{UI.swarms.manualSectionGeneral}</Label>
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={UI.swarms.manualSectionGeneral}
              />
            </Field>
            <Field>
              <Label className="sr-only">{UI.swarms.manualDescPlaceholder}</Label>
              <Input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={UI.swarms.manualDescPlaceholder}
              />
            </Field>
            {editError && (
              <ErrorMessage className="[&>[data-slot=error]]:mt-0">{editError}</ErrorMessage>
            )}
            <div className="flex items-center gap-2">
              <Button color="indigo" onClick={handleEdit} disabled={editLoading}>
                {editLoading ? UI.swarms.editSaving : UI.swarms.editSave}
              </Button>
              <Button outline onClick={() => setEditing(false)}>
                {UI.swarms.editCancel}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Kickoff panel */}
      {showKickoff && (
        <SectionCard>
          <Subheading level={2} className="mb-3">{UI.swarms.launchPanelTitle}</Subheading>
          <SwarmKickoffPanel
            swarmId={swarm.id}
            swarmName={swarm.name}
            onDone={() => { if (id) void loadSwarm(id); }}
          />
        </SectionCard>
      )}

      {/* Tab: Configuration */}
      {tab === "config" && (
        <SectionCard>
          <Subheading level={2} className="mb-3">{UI.swarms.manualSectionGeneral}</Subheading>
          <DescriptionList>
            <DescriptionTerm>{UI.swarms.metaName}</DescriptionTerm>
            <DescriptionDetails>{swarm.name}</DescriptionDetails>
            {swarm.description && (
              <>
                <DescriptionTerm>{UI.swarms.metaDescription}</DescriptionTerm>
                <DescriptionDetails>{swarm.description}</DescriptionDetails>
              </>
            )}
            <DescriptionTerm>{UI.swarms.metaCreatedAt}</DescriptionTerm>
            <DescriptionDetails>{createdAt}</DescriptionDetails>
          </DescriptionList>

          {swarm.tool_bindings && swarm.tool_bindings.length > 0 && (
            <div className="mt-4">
              <Subheading level={3} className="mb-2 text-zinc-500 uppercase dark:text-zinc-400">
                {UI.swarms.toolsTitle}
              </Subheading>
              <div className="flex flex-wrap gap-2">
                {swarm.tool_bindings.map((tb, i) => (
                  <Badge key={i}>{tb.tool_id}</Badge>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Tab: Agents & Tasks */}
      {tab === "agents" && (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
          <SectionCard>
            <Subheading level={2} className="mb-3">{UI.swarms.agentsCount(swarm.agents?.length ?? 0)}</Subheading>
            {(swarm.agents ?? []).length === 0 ? (
              <Text className="py-8 text-center">{UI.swarms.agentsEmpty}</Text>
            ) : (
              <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
                {(swarm.agents ?? []).map((agent, i) => (
                  <li key={agent.id ?? i} className="py-4 first:pt-0 last:pb-0">
                    <Text className="font-medium text-zinc-950 dark:text-white">{agent.name}</Text>
                    <Text className="mt-0.5 text-indigo-600 dark:text-indigo-400">{agent.role}</Text>
                    {agent.goal && <Text className="mt-1">{agent.goal}</Text>}
                    {agent.backstory && <Text className="mt-1">{agent.backstory}</Text>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard>
            <Subheading level={2} className="mb-3">{UI.swarms.tasksCount(swarm.tasks?.length ?? 0)}</Subheading>
            {(swarm.tasks ?? []).length === 0 ? (
              <Text className="py-8 text-center">{UI.swarms.tasksEmpty}</Text>
            ) : (
              <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
                {(swarm.tasks ?? []).map((task, i) => (
                  <li key={task.id ?? i} className="py-4 first:pt-0 last:pb-0">
                    <Text className="font-medium text-zinc-950 dark:text-white">{task.name}</Text>
                    {task.description && <Text className="mt-0.5">{task.description}</Text>}
                    {task.expected_output && (
                      <Text className="mt-1">
                        {UI.swarms.expectedOutputPrefix}{task.expected_output}
                      </Text>
                    )}
                    {task.agent_name && (
                      <div className="mt-2">
                        <Badge>{task.agent_name}</Badge>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
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
    <SectionCard>
      <div className="mb-4 flex items-center justify-between">
        <Subheading level={2}>{UI.swarms.runsHistory}</Subheading>
        <Button color="indigo" onClick={handleRelaunch} disabled={launching}>
          {launching ? UI.swarms.runsRelaunching : UI.swarms.runsRelaunch}
        </Button>
      </div>
      {runs.length === 0 ? (
        <Text className="py-8 text-center">{UI.swarms.runsEmpty}</Text>
      ) : (
        <div className="flow-root">
          <ul className="-mb-8">
            {runs.map((run, runIdx) => {
              const date = dateTimeFr(run.created_at);
              return (
                <li key={run.run_id}>
                  <div className="relative pb-8">
                    {runIdx !== runs.length - 1 ? (
                      <span aria-hidden="true" className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-zinc-950/10 dark:bg-white/10" />
                    ) : null}
                    <div className="relative flex items-start gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500/15 ring-8 ring-zinc-50 dark:ring-zinc-950">
                        <PlayCircleIcon aria-hidden="true" className="size-5 text-indigo-600 dark:text-indigo-300" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 pt-1.5">
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{run.run_id}</span>
                        <RunStatusBadge status={run.status} size="sm" />
                        <Text className="text-xs">{date}</Text>
                        <div className="ml-auto">
                          <Button href={`/swarms/${swarmId}/run/${run.run_id}`} outline>
                            {UI.swarms.runsView}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
