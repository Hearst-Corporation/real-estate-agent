import Link from "next/link";
import { BarList } from "@/components/cockpit/BarList";
import { Donut } from "@/components/cockpit/Donut";
import { Heatmap } from "@/components/cockpit/Heatmap";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { barsByStatus, topByCategory, distributeByBand, autoBands, ratio } from "@/lib/crm/aggregate";
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

/** Diamètre de l'anneau de complétion (carte donut accent). */
const DONUT_SIZE = 156;

/** Nombre de villes (lignes) affichées dans la heatmap ville × statut. */
const HEATMAP_TOP_CITIES = 6;

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
  const pipeline = barsByStatus(rows, ESTIMATION_STATUSES, UI.estimations.status, estimationTone);
  const byCity = topByCategory(rows, "city");
  const byValueBand = distributeByBand(
    rows,
    "market_value",
    autoBands(rows.map((r) => r.market_value))
  );
  const readyRate = ratio(rows, (r) => r.status === "ready");

  // ── Métriques de l'en-tête ──
  const nbEstimations = rows.length;
  const readyCount = rows.filter((r) => r.status === "ready").length;
  const portfolioValue = rows
    .filter((r) => r.status === "ready")
    .reduce((sum, r) => sum + (r.market_value ?? 0), 0);

  // ── Heatmap ville × statut (données réelles : top villes × cycle) ──
  const cityOf = (r: EstRow) => r.city?.trim() || t.heatmapNoCity;
  const cityCounts = new Map<string, number>();
  for (const r of rows) cityCounts.set(cityOf(r), (cityCounts.get(cityOf(r)) ?? 0) + 1);
  const heatRowLabels = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, HEATMAP_TOP_CITIES)
    .map(([city]) => city);
  const heatColLabels = ESTIMATION_STATUSES.map(
    (st) => UI.estimations.statusShort[st] ?? st
  );
  const heatMatrix = heatRowLabels.map((city) =>
    ESTIMATION_STATUSES.map(
      (st) => rows.filter((r) => cityOf(r) === city && r.status === st).length
    )
  );

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
      {/* ── Hero band premium (identité + valeur portefeuille + CTA) ── */}
      <section className="dash-hero">
        <div className="dash-hero-main">
          <p className="ct-eyebrow">{t.eyebrow}</p>
          <h1 className="ct-title dash-hero-title">{t.title}</h1>
          <p className="dash-hero-sub">{t.sub}</p>
        </div>
        <div className="dash-hero-aside">
          <div className="dash-hero-metric">
            <span className="dash-hero-metric-label">{t.kpis.portfolio}</span>
            <span className="dash-hero-metric-value">{eur(portfolioValue)}</span>
            <span className="dash-hero-metric-meta">{t.heroMeta(nbEstimations)}</span>
          </div>
          <Link href="/estimations/new" className="ct-seg-btn primary dash-hero-cta">
            {UI.estimations.newCta}
          </Link>
        </div>
      </section>

      {/* ── KPI CRM enrichis ── */}
      <div className="dash-kpis">
        <div className="dash-kpi accent">
          <span className="dash-kpi-label">{t.kpis.properties}</span>
          <span className="dash-kpi-value">{nbProperties}</span>
          <span className="dash-kpi-hint">{t.kpiHints.properties}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t.kpis.activeLeads}</span>
          <span className="dash-kpi-value">{nbLeadsActifs}</span>
          <span className="dash-kpi-hint">{t.kpiHints.activeLeads}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t.kpis.upcomingVisits}</span>
          <span className="dash-kpi-value">{nbVisitesAVenir}</span>
          <span className="dash-kpi-hint">{t.kpiHints.upcomingVisits}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">{t.kpis.activeMandates}</span>
          <span className="dash-kpi-value">{nbMandatsActifs}</span>
          <span className="dash-kpi-hint">{t.kpiHints.activeMandates}</span>
        </div>
      </div>

      {/* ── Pipeline (large) + complétion (donut accent) ── */}
      <div className="dash-grid">
        <div className="dash-card">
          <p className="dash-card-title">{t.charts.pipeline}</p>
          <div className="dash-card-body">
            <BarList items={pipeline} emptyLabel={UI.viz.empty} />
          </div>
        </div>
        <div className="dash-card accent dash-donut-card">
          <p className="dash-card-title">{t.charts.completion}</p>
          <Donut value={readyRate} sublabel={t.charts.completionSub} accent size={DONUT_SIZE} />
          <p className="dash-donut-meta">{t.donutMeta(readyCount, nbEstimations)}</p>
        </div>
      </div>

      {/* ── Répartition par ville + valeur estimée par tranche ── */}
      <div className="dash-grid even">
        <div className="dash-card">
          <p className="dash-card-title">{t.charts.byCity}</p>
          <div className="dash-card-body">
            <BarList items={byCity} emptyLabel={UI.viz.empty} />
          </div>
        </div>
        <div className="dash-card">
          <p className="dash-card-title">{t.charts.byValueBand}</p>
          <div className="dash-card-body">
            <BarList items={byValueBand} emptyLabel={UI.viz.empty} />
          </div>
        </div>
      </div>

      {/* ── Heatmap ville × statut (asset catalogue, données réelles) ── */}
      <div className="dash-card">
        <p className="dash-card-title">{t.charts.heatmap}</p>
        <div className="dash-card-body">
          <Heatmap
            rowLabels={heatRowLabels}
            colLabels={heatColLabels}
            matrix={heatMatrix}
            emptyLabel={UI.viz.empty}
          />
        </div>
      </div>

      {/* ── Estimations récentes (large) + activité ── */}
      <div className="dash-grid">
        <div className="dash-card">
          <p className="dash-card-title">{t.recent}</p>
          <div className="dash-card-body">
            {recent.length === 0 ? (
              <>
                <p className="ct-placeholder">{UI.estimations.empty}</p>
                <Link href="/estimations/new" className="ct-seg-btn primary dash-see-all">
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
                <Link href="/estimations" className="ct-seg-btn dash-see-all">
                  {t.seeAll}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="dash-card">
          <p className="dash-card-title">{t.activity}</p>
          <div className="dash-card-body">
            {upcomingVisits.length === 0 ? (
              <p className="ct-placeholder">{t.activityEmpty}</p>
            ) : (
              upcomingVisits.map((v) => {
                const propLabel =
                  v.properties?.title ??
                  v.properties?.city ??
                  (v.property_id ? t.propertyLinked : t.propertyMissing);
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
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Assistant ── */}
      <div className="dash-card">
        <p className="dash-card-title">{t.cards.assistantTitle}</p>
        <p className="dash-assistant-body">{t.cards.assistantBody}</p>
      </div>
    </>
  );
}
