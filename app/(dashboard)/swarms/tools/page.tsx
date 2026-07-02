import { PageHeader, Badge, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { getSession } from "@/lib/server/session";
import { uuidOwnerOf } from "@/lib/tenant";
import { listTools } from "@/lib/swarms/client";
import type { SwarmTool } from "@/lib/swarms/types";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";

export const dynamic = "force-dynamic";

export default async function SwarmsToolsPage() {
  const t = UI.tools;
  const claims = await getSession();
  const ownerId = claims ? uuidOwnerOf(claims) : null;

  let tools: SwarmTool[] = [];
  let loadError: string | null = null;
  if (ownerId) {
    try {
      tools = await listTools(ownerId);
    } catch {
      loadError = UI.swarms.engineFetchFailed;
      tools = [];
    }
  }

  const categories = new Set(
    tools.map((tool) => tool.category).filter((c): c is string => Boolean(c)),
  );

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.swarms} />}
        kpis={[
          { label: t.kpis.total, value: String(tools.length) },
          { label: t.kpis.categories, value: String(categories.size) },
        ]}
      />

      {/* TW+ lists__tables/02-simple-in-card — adapté thème sombre */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        {loadError ? (
          <p className="p-5 text-sm text-red-400">{loadError}</p>
        ) : tools.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.name}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.category}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.cols.description}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tools.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-4 text-sm font-medium whitespace-nowrap text-slate-100">
                      {r.name}
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap">
                      <Badge>{r.category ?? t.uncategorized}</Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">{r.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageStack>
  );
}
