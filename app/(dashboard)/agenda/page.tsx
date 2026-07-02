import Link from "next/link";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
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

  const columns: Column<VisitRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => (
        <div>
          <div>{dateFr(r.scheduled_at)}</div>
          <div className="text-xs text-slate-500">{timeFr(r.scheduled_at)}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (r) => r.status,
    },
    {
      key: "property",
      header: "Bien",
      render: (r) => r.properties?.title ?? r.properties?.city ?? "—",
    },
    {
      key: "lead",
      header: "Contact",
      render: (r) => r.leads?.full_name ?? "—",
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        kpis={[
          { label: t.kpis.thisWeek, value: String(thisWeek) },
          { label: t.kpis.today, value: String(today) },
          { label: t.kpis.toConfirm, value: String(toConfirm) },
        ]}
      />

      <Card variant="dense">
        {visits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-slate-500">{tv.empty}</p>
            <Link
              href="/visits"
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
            >
              {tv.newCta}
            </Link>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={visits}
            emptyLabel={tv.empty}
            getKey={(v) => v.id}
          />
        )}
      </Card>
    </PageStack>
  );
}
