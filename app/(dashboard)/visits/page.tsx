import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import VisitsList from "./_components/VisitsList";
import VisitForm from "./_components/VisitForm";

type VisitRow = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_min: number;
  notes: string | null;
  feedback: string | null;
  lead_id: string | null;
  property_id: string;
  properties: { title: string | null; city: string | null } | null;
};

export default async function VisitsPage() {
  const t = UI.visits;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let visits: VisitRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("visits")
      .select("*, properties(title, city)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("scheduled_at", { ascending: true });
    visits = (data ?? []) as VisitRow[];
  }

  const now = new Date();
  const upcoming = visits.filter((v) => new Date(v.scheduled_at) >= now);
  const past = visits.filter((v) => new Date(v.scheduled_at) < now);
  const done = visits.filter((v) => v.status === "realisee");
  const noShow = visits.filter((v) => v.status === "no_show");
  const noShowRate =
    visits.length > 0 ? Math.round((noShow.length / visits.length) * 100) : 0;

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid className="cols-4">
        <KpiCard>
          <div className="ct-kpi-label">{t.kpis.total}</div>
          <div className="ct-kpi-value">{visits.length}</div>
        </KpiCard>
        <KpiCard>
          <div className="ct-kpi-label">{t.kpis.upcoming}</div>
          <div className="ct-kpi-value">{upcoming.length}</div>
        </KpiCard>
        <KpiCard>
          <div className="ct-kpi-label">{t.kpis.done}</div>
          <div className="ct-kpi-value">{done.length}</div>
        </KpiCard>
        <KpiCard>
          <div className="ct-kpi-label">{t.kpis.noShow}</div>
          <div className="ct-kpi-value">{noShowRate}%</div>
        </KpiCard>
      </KpiGrid>

      <div className="ct-mb-sm" />

      <VisitForm cta={t.newCta} />

      <div className="ct-mb-sm" />

      {visits.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{t.empty}</p>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <h3 className="ct-card-title">{t.upcoming}</h3>
              <VisitsList visits={upcoming} statusLabels={t.statusLabels} deleteLabel={t.delete} durationUnit={t.durationUnit} />
            </>
          )}
          {past.length > 0 && (
            <>
              <h3 className="ct-card-title">{t.past}</h3>
              <VisitsList visits={past} statusLabels={t.statusLabels} deleteLabel={t.delete} durationUnit={t.durationUnit} />
            </>
          )}
        </>
      )}
    </>
  );
}
