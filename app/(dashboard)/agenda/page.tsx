import Link from "next/link";
import { PageHeader, Card, KpiGrid, KpiCard, Badge } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { dateFr, timeFr } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";

type VisitRow = {
  id: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  properties: { title: string | null; city: string | null } | null;
  leads: { full_name: string } | null;
};

/** Groupe un tableau de visites par jour (clé ISO YYYY-MM-DD). */
function groupByDay(visits: VisitRow[]): Map<string, VisitRow[]> {
  const map = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const key = v.scheduled_at.slice(0, 10);
    const bucket = map.get(key) ?? [];
    bucket.push(v);
    map.set(key, bucket);
  }
  return map;
}

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

  const grouped = groupByDay(visits);
  const days = Array.from(grouped.keys());

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} sub={t.sub} />

      <KpiGrid>
        <KpiCard label={t.kpis.thisWeek} value={String(thisWeek)} />
        <KpiCard label={t.kpis.today} value={String(today)} />
        <KpiCard label={t.kpis.toConfirm} value={String(toConfirm)} accent={toConfirm > 0} />
      </KpiGrid>

      <div className="ct-mb-sm" />

      {visits.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{tv.empty}</p>
          <div className="ct-mb-sm" />
          <Link href="/visits" className="ct-seg-btn">
            {tv.newCta}
          </Link>
        </Card>
      ) : (
        days.map((day) => {
          const dayVisits = grouped.get(day)!;
          return (
            <div key={day} className="crm-agenda-day">
              <p className="ct-eyebrow crm-agenda-day-header">
                {dateFr(day)}
              </p>
              {dayVisits.map((v) => {
                const tone = statusTone("visit", v.status);
                const propertyLabel =
                  v.properties?.title ?? v.properties?.city ?? UI.common.empty;
                const cityLabel = v.properties?.city
                  ? `${t.locationSeparator}${v.properties.city}`
                  : "";
                const leadLabel = v.leads?.full_name ?? null;
                const statusLabel =
                  tv.statusLabels[v.status] ?? v.status;

                return (
                  <Card key={v.id}>
                    <div className="crm-agenda-row">
                      <span className="crm-agenda-time">
                        {timeFr(v.scheduled_at)}
                      </span>
                      <div className="crm-agenda-info">
                        <span className="crm-agenda-property">
                          {propertyLabel}
                          {cityLabel}
                        </span>
                        {leadLabel && (
                          <span className="crm-agenda-lead">{leadLabel}</span>
                        )}
                      </div>
                      <Badge>
                        <span className={`crm-status ${tone}`}>
                          {statusLabel}
                        </span>
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
    </>
  );
}
