import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
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

  const columns: Column<SwarmTool>[] = [
    { key: "name", header: t.cols.name, render: (r) => r.name },
    {
      key: "category",
      header: t.cols.category,
      render: (r) => (
        <span className="ct-badge is-muted">{r.category ?? t.uncategorized}</span>
      ),
    },
    {
      key: "description",
      header: t.cols.description,
      render: (r) => r.description ?? "—",
    },
  ];

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

      <Card variant="dense">
        {loadError ? (
          <p className="ct-error">{loadError}</p>
        ) : (
          <DataTable
            columns={columns}
            rows={tools}
            emptyLabel={t.empty}
            getKey={(r) => r.id}
          />
        )}
      </Card>
    </PageStack>
  );
}
