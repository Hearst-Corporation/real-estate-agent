import Link from "next/link";
import { Eyebrow, Title, Sub, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

/** Nombre d'estimations récentes affichées sur le dashboard. */
const RECENT_LIMIT = 5;

/** Nombre de prochaines visites affichées dans l'activité récente. */
const VISITS_LIMIT = 5;

/** Statuts leads considérés comme "terminés" (exclus du count actifs). */
const LEADS_CLOSED = ["gagne", "perdu"];

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dtFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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

  // ── Estimations ────────────────────────────────────────────────────────────
  let rows: { id: string; status: string; city: string | null; property_type: string | null; market_value: number | null; updated_at: string }[] = [];

  // ── CRM KPIs ───────────────────────────────────────────────────────────────
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

  const recent = rows.slice(0, RECENT_LIMIT);

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
                    <span className="ct-placeholder">
                      {dtFmt.format(new Date(v.scheduled_at))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

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
            {recent.map((est) => (
              <div className="est-list-row" key={est.id}>
                <div className="est-list-info">
                  <div className="est-list-main">
                    {est.city ? est.city : est.property_type ? est.property_type : UI.estimations.fallbackName}
                    {est.property_type && est.city ? ` — ${est.property_type}` : ""}
                  </div>
                  <div className="est-list-meta">
                    <span className="ct-badge">{UI.estimations.status[est.status] ?? est.status}</span>
                    {est.market_value ? (
                      <span className="ct-placeholder">{eur.format(est.market_value)}</span>
                    ) : null}
                    <span className="ct-placeholder">
                      {new Date(est.updated_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>
                <Link href={`/estimations/${est.id}`} className="ct-seg-btn">
                  {est.status === "draft" || est.status === "interviewing" ? UI.estimations.resume : UI.estimations.open}
                </Link>
              </div>
            ))}
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
