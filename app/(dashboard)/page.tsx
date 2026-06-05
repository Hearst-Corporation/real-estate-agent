import Link from "next/link";
import { Eyebrow, Title, Sub, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { Funnel } from "@/components/cockpit/Funnel";
import { BarList } from "@/components/cockpit/BarList";
import { Donut } from "@/components/cockpit/Donut";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { countByStatus, topByCategory, distributeByBand, ratio } from "@/lib/crm/aggregate";
import { eur, dateFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

/** Nombre d'estimations récentes affichées dans le tableau. */
const RECENT_LIMIT = 5;

/** Nombre de prochaines visites affichées dans l'activité récente. */
const VISITS_LIMIT = 5;

/** Statuts leads considérés comme "terminés" (exclus du count actifs). */
const LEADS_CLOSED = ["gagne", "perdu"];

/** Ordre canonique du cycle d'une estimation (pour le funnel). */
const ESTIMATION_STATUSES = ["draft", "interviewing", "recap", "valuating", "ready", "archived"];

/** Tonalité d'un statut d'estimation (ready = positif, archived = négatif). */
function estimationTone(status: string): "is-positive" | "is-negative" | "is-pending" {
  if (status === "ready") return "is-positive";
  if (status === "archived") return "is-negative";
  return "is-pending";
}

type EstRow = {
  id: string;
  status: string;
  city: string | null;
  property_type: string | null;
  market_value: number | null;
  updated_at: string;
};

type UpcomingVisit = {
  id: string;
  scheduled_at: string;
  property_id: string | null;
  properties: { title: string | null; city: string | null } | null;
};

export default async function DashboardPage() {
  const t = UI.dashboard;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let rows: EstRow[] = [];
  let nbProperties = 0;
  let nbLeadsActifs = 0;
  let nbVisitesAVenir = 0;
  let nbMandatsActifs = 0;
  let upcomingVisits: UpcomingVisit[] = [];

  if (claims && sb) {
    const uid = claims.sub;
    const tid = tenantOf(claims);
    const now = new Date().toISOString();

    const [
      estimationsRes,
      propertiesRes,
      leadsRes,
      visitsCountRes,
      visitsUpcomingRes,
      mandatesRes,
    ] = await Promise.all([
      sb
        .from("estimations")
        .select("id, status, city, property_type, market_value, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: false }),

      sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid),

      sb
        .from("leads")
        .select("id, status", { count: "exact" })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("status", "in", `(${LEADS_CLOSED.join(",")})`),

      sb
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", now),

      sb
        .from("visits")
        .select("id, scheduled_at, property_id, properties(title, city)")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(VISITS_LIMIT),

      sb
        .from("mandates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "actif"),
    ]);

    rows = estimationsRes.data ?? [];
    nbProperties = propertiesRes.count ?? 0;
    nbLeadsActifs = leadsRes.count ?? (leadsRes.data?.length ?? 0);
    nbVisitesAVenir = visitsCountRes.count ?? 0;
    nbMandatsActifs = mandatesRes.count ?? 0;
    upcomingVisits = (visitsUpcomingRes.data as unknown as UpcomingVisit[]) ?? [];
  }

  // ── Agrégations viz (données déjà en mémoire) ──
  const pipeline = countByStatus(rows, ESTIMATION_STATUSES, UI.estimations.status, estimationTone);
  const byCity = topByCategory(rows, "city");
  const byValueBand = distributeByBand(rows, "market_value");
  const readyRate = ratio(rows, (r) => r.status === "ready");

  const recent = rows.slice(0, RECENT_LIMIT);

  const recentColumns: Column<EstRow>[] = [
    {
      key: "property",
      header: t.table.property,
      render: (r) =>
        r.city ?? r.property_type ?? UI.estimations.fallbackName,
    },
    {
      key: "status",
      header: t.table.status,
      render: (r) => (
        <span className={`crm-status ${estimationTone(r.status)}`}>
          {UI.estimations.status[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: "value",
      header: t.table.value,
      align: "right",
      render: (r) => eur(r.market_value),
    },
    {
      key: "updated",
      header: t.table.updated,
      align: "right",
      render: (r) => dateFr(r.updated_at),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (r) => (
        <Link href={`/estimations/${r.id}`} className="ct-seg-btn">
          {r.status === "draft" || r.status === "interviewing"
            ? UI.estimations.resume
            : UI.estimations.open}
        </Link>
      ),
    },
  ];

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      {/* ── KPI CRM ── */}
      <KpiGrid>
        <KpiCard label={t.kpis.properties} value={String(nbProperties)} accent />
        <KpiCard label={t.kpis.activeLeads} value={String(nbLeadsActifs)} />
        <KpiCard label={t.kpis.upcomingVisits} value={String(nbVisitesAVenir)} />
        <KpiCard label={t.kpis.activeMandates} value={String(nbMandatsActifs)} />
      </KpiGrid>

      {/* ── Viz rangée 1 : pipeline + villes ── */}
      <div className="ct-viz-row">
        <Card title={t.charts.pipeline}>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.byCity}>
          <BarList items={byCity} emptyLabel={UI.viz.empty} />
        </Card>
      </div>

      {/* ── Viz rangée 2 : tranches de valeur + complétion ── */}
      <div className="ct-viz-row">
        <Card title={t.charts.byValueBand}>
          <BarList items={byValueBand} emptyLabel={UI.viz.empty} />
        </Card>
        <Card title={t.charts.completion}>
          <Donut value={readyRate} sublabel={t.charts.completionSub} accent />
        </Card>
      </div>

      {/* ── Activité récente : prochaines visites ── */}
      {upcomingVisits.length > 0 && (
        <Card title={t.activity}>
          {upcomingVisits.map((v) => {
            const propLabel =
              v.properties?.title ??
              v.properties?.city ??
              (v.property_id ? "Bien lié" : "Bien non renseigné");
            return (
              <div className="est-list-row" key={v.id}>
                <div className="est-list-info">
                  <div className="est-list-main">{propLabel}</div>
                  <div className="est-list-meta">
                    <span className="ct-badge">{t.visitBadge}</span>
                    <span className="ct-placeholder">{dateFr(v.scheduled_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* ── Estimations récentes (tableau) ── */}
      <Card title={t.recent}>
        {recent.length === 0 ? (
          <>
            <p className="ct-placeholder">{UI.estimations.empty}</p>
            <div className="ct-mb-sm" />
            <Link href="/estimations/new" className="ct-seg-btn primary">
              {UI.estimations.newCta}
            </Link>
          </>
        ) : (
          <>
            <DataTable
              columns={recentColumns}
              rows={recent}
              emptyLabel={UI.estimations.empty}
              getKey={(r) => r.id}
            />
            <div className="ct-mb-sm" />
            <Link href="/estimations" className="ct-seg-btn">
              {t.seeAll}
            </Link>
          </>
        )}
      </Card>

      <Card title={t.cards.assistantTitle}>{t.cards.assistantBody}</Card>
    </>
  );
}
