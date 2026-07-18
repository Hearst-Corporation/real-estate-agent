import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { Donut } from "@/components/cockpit/Donut";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { DeleteButton } from "@/components/cockpit/DeleteButton";
import { Heading, Subheading } from "@/components/ui/heading";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/table";
import { countByStatus, ratio } from "@/lib/crm/aggregate";
import { dateTimeFr, VISIT_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import VisitForm from "./_components/VisitForm";
import VisitReportForm from "./_components/VisitReportForm";
import type { VisitReportRow } from "@/lib/visit-report/schema";

type VisitRow = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_min: number;
  property_id: string;
  properties: { title: string | null; city: string | null } | null;
};

export default async function VisitsPage() {
  const t = UI.visits;
  const claims = await getSession();
  const sb = getGpu1Admin();

  let visits: VisitRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("visits")
      .select("id, status, scheduled_at, duration_min, property_id, properties(title, city)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("scheduled_at", { ascending: true })
      .limit(200);
    visits = (data ?? []) as unknown as VisitRow[];
  }

  // Comptes-rendus rattachés (W7) — dégrade proprement si la table 0051 n'existe
  // pas encore (query en erreur → map vide, la colonne CR reste "à rédiger").
  const reportsByVisit = new Map<string, VisitReportRow>();
  if (claims && sb && visits.length > 0) {
    const { data: reports } = await sb
      .from("visit_reports")
      .select("*")
      .eq("tenant_id", tenantOf(claims))
      .in(
        "visit_id",
        visits.map((v) => v.id),
      );
    for (const r of (reports ?? []) as unknown as VisitReportRow[]) {
      reportsByVisit.set(r.visit_id, r);
    }
  }

  const now = new Date();
  const upcoming = visits.filter((v) => new Date(v.scheduled_at) >= now);
  const done = visits.filter((v) => v.status === "realisee").length;
  const noShow = visits.filter((v) => v.status === "no_show").length;
  const noShowRate = visits.length > 0 ? Math.round((noShow / visits.length) * 100) : 0;

  const pipeline = countByStatus(visits, VISIT_STATUSES, t.statusLabels, (s) =>
    statusTone("visit", s),
  );
  const doneRate = ratio(visits, (v) => v.status === "realisee");

  const stats = [
    { name: t.kpis.total, value: String(visits.length) },
    { name: t.kpis.upcoming, value: String(upcoming.length) },
    { name: t.kpis.done, value: String(done) },
    { name: t.kpis.noShow, value: `${noShowRate}%` },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-950/10 pb-5 dark:border-white/10">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
              {t.eyebrow}
            </p>
            <Heading>{t.title}</Heading>
          </div>
          <div className="mt-4 flex shrink-0 md:mt-0 md:ml-4">
            <VisitForm cta={t.newCta} />
          </div>
        </div>
        <nav aria-label="Tabs" className="-mb-px flex flex-wrap items-center gap-1">
          <PageNavTabs tabs={TAB_GROUPS.clients} />
        </nav>
      </div>

      {/* KPI — grille zinc + primitives */}
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="surface overflow-hidden px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-zinc-500">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Charts — conteneur zinc, viz métier conservée */}
      <div className="grid grid-cols-1 items-start gap-6 @2xl:grid-cols-2">
        <section className="surface p-5">
          <Subheading className="font-titre mb-3">{t.charts.pipeline}</Subheading>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="surface p-5">
          <Subheading className="font-titre mb-3">{t.charts.doneRate}</Subheading>
          <Donut value={doneRate} sublabel={t.charts.doneRateSub} accent />
        </section>
      </div>

      {/* Table — primitives Catalyst */}
      {visits.length === 0 ? (
        <div className="surface px-6 py-16 text-center">
          <CalendarDaysIcon aria-hidden="true" className="mx-auto size-12 text-zinc-400" />
          <Subheading className="mt-2">{t.empty}</Subheading>
        </div>
      ) : (
        <div className="surface overflow-hidden px-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t.table.property}</TableHeader>
                <TableHeader>{t.table.datetime}</TableHeader>
                <TableHeader className="text-right">{t.table.duration}</TableHeader>
                <TableHeader>{t.table.status}</TableHeader>
                <TableHeader>Compte-rendu</TableHeader>
                <TableHeader className="text-right">{t.table.action}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {visits.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium text-zinc-950 dark:text-white">
                    {v.properties?.title ?? v.properties?.city ?? v.property_id}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {dateTimeFr(v.scheduled_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {`${v.duration_min}${t.durationUnit}`}
                  </TableCell>
                  <TableCell>
                    <StatusSelect
                      endpoint={`/api/visits/${v.id}`}
                      value={v.status}
                      options={VISIT_STATUSES}
                      labels={t.statusLabels}
                      ariaLabel={t.table.status}
                    />
                  </TableCell>
                  <TableCell>
                    <VisitReportForm
                      key={reportsByVisit.get(v.id)?.updated_at ?? "new"}
                      visitId={v.id}
                      initial={reportsByVisit.get(v.id) ?? null}
                      cta={reportsByVisit.get(v.id) ? "Voir / modifier" : "Rédiger"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteButton
                      endpoint={`/api/visits/${v.id}`}
                      label={t.delete}
                      confirmMessage={t.delete}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
