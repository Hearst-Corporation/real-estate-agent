import Link from "next/link";
import { CalendarIcon, MapPinIcon, UserIcon } from "@heroicons/react/24/outline";
import { dateFr, timeFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

type VisitRow = {
  id: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  properties: { title: string | null; city: string | null } | null;
  leads: { full_name: string } | null;
};


/** Compte les visites planifiées dans les 7 prochains jours (à partir d'aujourd'hui minuit). */
function countThisWeek(visits: VisitRow[]): number {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return visits.filter((v) => {
    const d = new Date(v.scheduled_at);
    return d >= now && d <= weekEnd;
  }).length;
}

/** Compte les visites aujourd'hui. */
function countToday(visits: VisitRow[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return visits.filter((v) => v.scheduled_at.slice(0, 10) === today).length;
}

export default async function AgendaPage() {
  const t = UI.agenda;
  const tv = UI.visits;

  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let visits: VisitRow[] = [];

  if (claims && sb) {
    const now = new Date().toISOString();
    const { data } = await sb
      .from("visits")
      .select("id, scheduled_at, duration_min, status, properties(title, city), leads(full_name)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .gte("scheduled_at", now)
      .order("scheduled_at", { ascending: true });
    visits = (data as VisitRow[]) ?? [];
  }

  const thisWeek = countThisWeek(visits);
  const today = countToday(visits);
  const toConfirm = visits.filter((v) => v.status === "planifiee").length;

  const stats = [
    { name: t.kpis.thisWeek, value: String(thisWeek) },
    { name: t.kpis.today, value: String(today) },
    { name: t.kpis.toConfirm, value: String(toConfirm) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12 @container">
      {/* ── Header de page (TW+ page-headings/01-with-actions, thème sombre) ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
            {t.eyebrow}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.title}</h1>
        </div>
      </div>

      {/* ── Stats (TW+ data-display__stats/03-simple-in-cards, thème sombre) ── */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 shadow-lg shadow-black/20 sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* ── Liste des visites (TW+ lists__stacked-lists/01-simple, thème sombre) ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        {visits.length === 0 ? (
          /* TW+ feedback__empty-states/02-with-dashed-border, thème sombre */
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
            <CalendarIcon aria-hidden="true" className="size-10 text-slate-500" />
            <p className="text-sm text-slate-400">{tv.empty}</p>
            <Link
              href="/visits"
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            >
              {tv.newCta}
            </Link>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-white/5">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap justify-between gap-x-6 gap-y-2 py-5">
                <div className="flex min-w-0 gap-x-4">
                  <div className="flex size-12 flex-none items-center justify-center rounded-xl border border-white/10 bg-indigo-500/15 text-indigo-300">
                    <CalendarIcon aria-hidden="true" className="size-6" />
                  </div>
                  <div className="min-w-0 flex-auto">
                    <p className="text-sm font-semibold text-slate-100">
                      {v.properties?.title ?? v.properties?.city ?? "—"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-400">
                      <UserIcon aria-hidden="true" className="size-4 text-slate-500" />
                      {v.leads?.full_name ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center">
                  <p className="flex items-center gap-1.5 text-sm text-slate-100">
                    <MapPinIcon aria-hidden="true" className="size-4 text-slate-500" />
                    <time dateTime={v.scheduled_at}>
                      {dateFr(v.scheduled_at)} · {timeFr(v.scheduled_at)}
                    </time>
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-slate-200">
                    {v.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
