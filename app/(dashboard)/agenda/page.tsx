import { CalendarIcon, ClockIcon, UserIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { timeFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
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
  property_id: string | null;
  lead_id: string | null;
  properties: { title: string | null; city: string | null } | null;
  leads: { full_name: string } | null;
};

/** Jour local (YYYY-MM-DD) d'une date ISO. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Compte les visites planifiées dans les 7 prochains jours (à partir de maintenant). */
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
  return visits.filter((v) => dayKey(v.scheduled_at) === today).length;
}

/**
 * Regroupe les visites (déjà triées par date croissante) par JOUR, en préservant
 * l'ordre. Un agenda se lit par journée : une seule bande temporelle par groupe,
 * l'urgence portée par la proximité du jour (aujourd'hui en tête).
 */
function groupByDay(visits: VisitRow[]): { key: string; items: VisitRow[] }[] {
  const groups: { key: string; items: VisitRow[] }[] = [];
  for (const v of visits) {
    const k = dayKey(v.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(v);
    else groups.push({ key: k, items: [v] });
  }
  return groups;
}

/** Libellé de jour lisible (« lundi 21 juillet ») — donnée calculée, pas une string UI. */
function dayLabel(dayIso: string): string {
  return new Date(`${dayIso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function AgendaPage() {
  const t = UI.agenda;
  const tv = UI.visits;

  const claims = await getSession();
  const sb = getGpu1Admin();

  let visits: VisitRow[] = [];

  if (claims && sb) {
    const now = new Date().toISOString();
    const { data } = await sb
      .from("visits")
      .select(
        "id, scheduled_at, duration_min, status, property_id, lead_id, properties(title, city), leads(full_name)",
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .gte("scheduled_at", now)
      .order("scheduled_at", { ascending: true });
    // La projection embarque des tables liées (properties/leads) : la Row inférée
    // du client ne les décrit pas → cast via `unknown` vers la forme de vue attendue.
    visits = (data as unknown as VisitRow[]) ?? [];
  }

  const thisWeek = countThisWeek(visits);
  const today = countToday(visits);
  const toConfirm = visits.filter((v) => v.status === "planifiee").length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dayGroups = groupByDay(visits);

  const stats = [
    { name: t.kpis.thisWeek, value: String(thisWeek) },
    { name: t.kpis.today, value: String(today) },
    { name: t.kpis.toConfirm, value: String(toConfirm) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 pb-12 @container">
      {/* ── Header de page ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-600">
            <span aria-hidden className="h-px w-6 bg-accent-500/70" />
            {t.eyebrow}
          </p>
          <Heading>{t.title}</Heading>
        </div>
      </div>

      {/* ── Stats (bandeau léger à filets or, cohérent avec l'accueil) ── */}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-accent-500/12 bg-accent-500/15 shadow-[var(--shadow-card)] @sm:grid-cols-3">
        {stats.map((item) => (
          <div key={item.name} className="bg-white px-5 py-4">
            <dt className="text-xs font-medium text-zinc-500">{item.name}</dt>
            <dd className="mt-1 text-2xl font-semibold leading-none tracking-tight text-accent-700 tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── Visites regroupées par jour ── */}
      {visits.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600"
          >
            <CalendarIcon className="size-6" />
          </span>
          <Text>{tv.empty}</Text>
          <Button href="/visits?new=1" color="indigo" className="mt-1">
            {tv.newCta}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dayGroups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key)}>
              {/* En-tête de journée : date lisible + repère « Aujourd'hui ». */}
              <div className="mb-2.5 flex items-center gap-2.5">
                <h2 className="text-sm font-semibold capitalize text-zinc-900">{dayLabel(g.key)}</h2>
                {g.key === todayKey ? <Badge color="indigo">{t.kpis.today}</Badge> : null}
                <span aria-hidden="true" className="h-px flex-1 bg-zinc-950/8" />
                <span className="tabular-nums text-xs font-medium text-zinc-400">
                  {g.items.length}
                </span>
              </div>

              {/* Liste compacte du jour : bien lié + contact lié, heure + statut. */}
              <ul className="surface divide-y divide-zinc-950/5 overflow-hidden">
                {g.items.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Heure — repère fort de la ligne. */}
                      <span className="flex w-14 shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums text-zinc-900">
                        <ClockIcon aria-hidden="true" className="size-4 text-accent-600" />
                        <time dateTime={v.scheduled_at}>{timeFr(v.scheduled_at)}</time>
                      </span>
                      <div className="min-w-0">
                        {/* Bien lié → fiche bien (lien unique, plus de doublon). */}
                        {v.property_id ? (
                          <Link
                            href={`/properties/${v.property_id}`}
                            className="block truncate rounded-sm text-sm font-medium text-zinc-900 hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                          >
                            {v.properties?.title ?? v.properties?.city ?? t.noProperty}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {v.properties?.title ?? v.properties?.city ?? t.noProperty}
                          </p>
                        )}
                        {/* Contact lié → fiche lead (lien unique). */}
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                          <UserIcon aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" />
                          {v.lead_id ? (
                            <Link
                              href={`/leads/${v.lead_id}`}
                              className="truncate rounded-sm hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                            >
                              {v.leads?.full_name ?? t.noContact}
                            </Link>
                          ) : (
                            <span className="truncate">{v.leads?.full_name ?? t.noContact}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge color={v.status === "planifiee" ? "amber" : "zinc"}>
                      {tv.statusLabels[v.status] ?? v.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
