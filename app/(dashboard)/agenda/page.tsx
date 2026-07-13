import { CalendarIcon, MapPinIcon, UserIcon } from "@heroicons/react/24/outline";
import { dateFr, timeFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

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
      {/* ── Header de page ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
            {t.eyebrow}
          </p>
          <Heading>{t.title}</Heading>
        </div>
      </div>

      {/* ── Stats (grille KPI + primitives) ── */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((item) => (
          <div key={item.name} className="surface p-4">
            <dt>
              <Text>{item.name}</Text>
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── Liste des visites (stacked list) ── */}
      <section className="surface p-5">
        {visits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-950/10 px-6 py-12 text-center">
            <CalendarIcon aria-hidden="true" className="size-10 text-zinc-400" />
            <Text>{tv.empty}</Text>
            <Button href="/visits" color="indigo" className="mt-2">
              {tv.newCta}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-950/5">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap justify-between gap-x-6 gap-y-2 py-5">
                <div className="flex min-w-0 gap-x-4">
                  <div className="flex size-12 flex-none items-center justify-center rounded-xl border border-zinc-950/10 bg-accent-500/15 text-accent-500 dark:border-white/10 dark:text-accent-400">
                    <CalendarIcon aria-hidden="true" className="size-6" />
                  </div>
                  <div className="min-w-0 flex-auto">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {v.properties?.title ?? v.properties?.city ?? "—"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      <UserIcon
                        aria-hidden="true"
                        className="size-4 text-zinc-400 dark:text-zinc-500"
                      />
                      {v.leads?.full_name ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                  <p className="flex items-center gap-1.5 text-sm text-zinc-950 dark:text-white">
                    <MapPinIcon
                      aria-hidden="true"
                      className="size-4 text-zinc-400 dark:text-zinc-500"
                    />
                    <time dateTime={v.scheduled_at}>
                      {dateFr(v.scheduled_at)} · {timeFr(v.scheduled_at)}
                    </time>
                  </p>
                  <Badge color={v.status === "planifiee" ? "amber" : "zinc"}>
                    {tv.statusLabels[v.status] ?? v.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
