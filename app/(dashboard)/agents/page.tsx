import { CpuChipIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { buildAgentRoster, type AgentRosterStatus } from "@/lib/agents/overview";
import { Badge } from "@/components/ui/badge";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

export const dynamic = "force-dynamic";

const STATUS_BADGE_COLOR: Record<AgentRosterStatus, "amber" | "zinc" | "indigo"> = {
  spec: "amber",
  draft: "zinc",
  live: "indigo",
};

export default async function AgentsPage() {
  const t = UI.agents;
  const roster = await buildAgentRoster();
  const liveCount = roster.filter((a) => a.status === "live").length;

  const stats = [
    { name: t.kpis.total, value: String(roster.length) },
    { name: t.kpis.live, value: String(liveCount) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1 pb-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <Subheading className="text-accent-500 dark:text-accent-400">{t.eyebrow}</Subheading>
          <Heading>{t.title}</Heading>
          <Text className="mt-1">{t.sub}</Text>
        </div>
      </div>

      {/* KPI */}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="surface p-4">
            <dt className="truncate text-sm/6 text-zinc-500 dark:text-zinc-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Roster */}
      {roster.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-950/10 px-6 py-12 text-center">
          <CpuChipIcon aria-hidden="true" className="size-10 text-zinc-400" />
          <Text>{t.empty}</Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 @container sm:grid-cols-2 @2xl:grid-cols-3">
          {roster.map((agent) => (
            <div key={agent.id} className="surface flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 flex-none items-center justify-center rounded-xl border border-zinc-950/10 bg-accent-500/15 text-accent-500 dark:border-white/10 dark:text-accent-400">
                    <CpuChipIcon aria-hidden="true" className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                      {agent.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{agent.focus}</p>
                  </div>
                </div>
                <Badge color={STATUS_BADGE_COLOR[agent.status]}>
                  {t.statusLabels[agent.status] ?? agent.status}
                </Badge>
              </div>
              <Text className="text-sm">{agent.description}</Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
