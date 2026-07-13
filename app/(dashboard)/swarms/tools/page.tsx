import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { getSession } from "@/lib/server/session";
import { uuidOwnerOf } from "@/lib/tenant";
import { listTools } from "@/lib/swarms/client";
import type { SwarmTool } from "@/lib/swarms/types";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { ErrorMessage } from "@/components/ui/fieldset";

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

      <div className="rounded-2xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
        {loadError ? (
          <ErrorMessage className="[&>[data-slot=error]]:mt-0">{loadError}</ErrorMessage>
        ) : tools.length === 0 ? (
          <Text className="py-8 text-center">{t.empty}</Text>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t.cols.name}</TableHeader>
                <TableHeader>{t.cols.category}</TableHeader>
                <TableHeader>{t.cols.description}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {tools.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-zinc-950 dark:text-white">{r.name}</TableCell>
                  <TableCell>
                    <Badge>{r.category ?? t.uncategorized}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal text-zinc-500 dark:text-zinc-400">
                    {r.description ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageStack>
  );
}
