import type { ReactNode } from "react";
import Link from "next/link";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
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

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  "is-positive": "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  "is-negative": "border-red-400/30 bg-red-500/10 text-red-300",
  "is-pending": "border-white/10 bg-white/[0.06] text-slate-300",
};

const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  "is-positive": "bg-emerald-400",
  "is-negative": "bg-red-400",
  "is-pending": "bg-slate-400",
};

/** Badge de statut pill — dot coloré + libellé, tonalité pilotée par `statusTone`. */
function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE_CLASSES[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT_CLASSES[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

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
      {/* Header — bloc TW+ headings__page-headings/01-with-actions (adapté sombre) */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:truncate">{t.title}</h1>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href="/estimations/new"
              className="inline-flex items-center rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              {t.newCta}
            </Link>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
          <PageNavTabs tabs={TAB_GROUPS.portefeuille} />
        </nav>
      </div>

      {/* Stats — bloc TW+ data-display__stats/03-simple-in-cards (adapté sombre) */}
      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-white">{item.stat}</dd>
          </div>
        ))}
      </dl>

      {/* Répartitions — cards conteneur (layout__cards) + listes en pill de valeurs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-100">{t.charts.pipeline}</h2>
          {pipeline.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {pipeline.map((step) => (
                <li key={step.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-slate-300">{step.label}</span>
                  <StatusPill tone={step.tone ?? "is-pending"}>{step.count}</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{UI.viz.empty}</p>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-100">{t.charts.byType}</h2>
          {byType.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {byType.map((item) => (
                <li key={item.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-slate-300">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-100">{item.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{UI.viz.empty}</p>
          )}
        </section>
      </div>

      {/* Table — bloc TW+ lists__tables/02-simple-in-card (adapté sombre) */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {estimations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pr-3 pl-5 text-left text-sm font-semibold text-slate-200">
                    {t.table.location}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-200">
                    {t.table.type}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-200">
                    {t.table.value}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-200">
                    {t.table.status}
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-200">
                    {t.table.updated}
                  </th>
                  <th scope="col" className="py-3.5 pr-5 pl-3">
                    <span className="sr-only">{t.table.action}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {estimations.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-4 pr-3 pl-5 text-sm font-medium whitespace-nowrap text-white">
                      {e.city ?? e.property_type ?? t.fallbackName}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap text-slate-400">
                      {e.property_type ?? "—"}
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-slate-300">
                      {eur(e.market_value)}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap">
                      <StatusPill tone={statusTone("estimation", e.status)}>
                        {t.status[e.status] ?? e.status}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-slate-400">
                      {dateFr(e.updated_at)}
                    </td>
                    <td className="py-4 pr-5 pl-3 text-right text-sm whitespace-nowrap">
                      <Link
                        href={`/estimations/${e.id}`}
                        className="font-medium text-indigo-300 transition-colors hover:text-indigo-200"
                      >
                        {e.status === "draft" || e.status === "interviewing" ? t.resume : t.open}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty state — bloc TW+ feedback__empty-states/01-simple (adapté sombre) */
          <div className="px-6 py-16 text-center">
            <HomeModernIcon aria-hidden="true" className="mx-auto size-12 text-slate-500" />
            <h3 className="mt-2 text-sm font-semibold text-white">{t.empty}</h3>
            <div className="mt-6">
              <Link
                href="/estimations/new"
                className="inline-flex items-center rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
              >
                {t.newCta}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
