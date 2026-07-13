import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/table";
import { countByStatus, topByCategory, average } from "@/lib/crm/aggregate";
import { eur, dateFr } from "@/lib/crm/format";
import { statusTone, type StatusTone } from "@/lib/crm/statusTone";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { HomeModernIcon } from "@heroicons/react/24/outline";

/** Ordre canonique du cycle d'une estimation. */
const ESTIMATION_STATUSES = ["draft", "interviewing", "recap", "valuating", "ready", "archived"];
const IN_PROGRESS = ["draft", "interviewing", "recap", "valuating"];

/** Tonalité `statusTone` → couleur de badge Catalyst (couleurs d'état tolérées). */
const TONE_BADGE: Record<StatusTone, "lime" | "red" | "zinc"> = {
  "is-positive": "lime",
  "is-negative": "red",
  "is-pending": "zinc",
};

type EstRow = {
  id: string;
  status: string;
  city: string | null;
  property_type: string | null;
  market_value: number | null;
  updated_at: string;
};

export default async function EstimationsPage() {
  const t = UI.estimations;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let estimations: EstRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("estimations")
      .select("id, status, city, property_type, market_value, updated_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    estimations = (data ?? []) as EstRow[];
  }

  const ready = estimations.filter((e) => e.status === "ready").length;
  const inProgress = estimations.filter((e) => IN_PROGRESS.includes(e.status)).length;
  const avgValue = average(estimations, "market_value");

  const pipeline = countByStatus(estimations, ESTIMATION_STATUSES, t.status, (s) =>
    statusTone("estimation", s)
  );
  const byType = topByCategory(estimations, "property_type");

  const stats = [
    { name: t.kpis.total, stat: String(estimations.length) },
    { name: t.kpis.ready, stat: String(ready) },
    { name: t.kpis.inProgress, stat: String(inProgress) },
    { name: t.kpis.avgValue, stat: eur(avgValue) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
              {t.eyebrow}
            </p>
            <Heading>{t.title}</Heading>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Button color="indigo" href="/estimations/new">
              {t.newCta}
            </Button>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1 border-b border-zinc-950/10 pb-2 dark:border-white/10">
          <PageNavTabs tabs={TAB_GROUPS.portefeuille} />
        </nav>
      </div>

      {/* Stats — KPI en grille sobre (structure lue dans data-display__stats) */}
      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white/[0.03] px-4 py-5 sm:p-6 dark:border-white/10"
          >
            <dt className="truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">{item.stat}</dd>
          </div>
        ))}
      </dl>

      {/* Répartitions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
          <Subheading className="mb-4">{t.charts.pipeline}</Subheading>
          {pipeline.length > 0 ? (
            <ul className="divide-y divide-zinc-950/10 dark:divide-white/10">
              {pipeline.map((step) => (
                <li key={step.label} className="flex items-center justify-between py-2.5">
                  <Text>{step.label}</Text>
                  <Badge color={TONE_BADGE[step.tone ?? "is-pending"]}>{step.count}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Text className="py-6 text-center">{UI.viz.empty}</Text>
          )}
        </section>

        <section className="rounded-xl border border-zinc-950/10 bg-white/[0.03] p-5 dark:border-white/10">
          <Subheading className="mb-4">{t.charts.byType}</Subheading>
          {byType.length > 0 ? (
            <ul className="divide-y divide-zinc-950/10 dark:divide-white/10">
              {byType.map((item) => (
                <li key={item.label} className="flex items-center justify-between py-2.5">
                  <Text>{item.label}</Text>
                  <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{item.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Text className="py-6 text-center">{UI.viz.empty}</Text>
          )}
        </section>
      </div>

      {/* Table — primitives Catalyst */}
      {estimations.length > 0 ? (
        <div className="rounded-xl border border-zinc-950/10 bg-white/[0.03] px-2 dark:border-white/10">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t.table.location}</TableHeader>
                <TableHeader>{t.table.type}</TableHeader>
                <TableHeader className="text-right">{t.table.value}</TableHeader>
                <TableHeader>{t.table.status}</TableHeader>
                <TableHeader className="text-right">{t.table.updated}</TableHeader>
                <TableHeader>
                  <span className="sr-only">{t.table.action}</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {estimations.map((e) => (
                <TableRow key={e.id} href={`/estimations/${e.id}`}>
                  <TableCell className="font-medium text-zinc-950 dark:text-white">
                    {e.city ?? e.property_type ?? t.fallbackName}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {e.property_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur(e.market_value)}</TableCell>
                  <TableCell>
                    <Badge color={TONE_BADGE[statusTone("estimation", e.status)]}>
                      {t.status[e.status] ?? e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                    {dateFr(e.updated_at)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-indigo-600 dark:text-indigo-400">
                    {e.status === "draft" || e.status === "interviewing" ? t.resume : t.open}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Empty state */
        <div className="rounded-xl border border-zinc-950/10 bg-white/[0.03] px-6 py-16 text-center dark:border-white/10">
          <HomeModernIcon aria-hidden="true" className="mx-auto size-12 text-zinc-400 dark:text-zinc-500" />
          <Subheading className="mt-2">{t.empty}</Subheading>
          <div className="mt-6">
            <Button color="indigo" href="/estimations/new">
              {t.newCta}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
