import { notFound } from "next/navigation";
import { Eyebrow, Title, Sub, KpiGrid, KpiCard, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { buildAdminOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const t = UI.admin;

  // Garde stricte : tout role !== 'admin' (y compris undefined) → 404.
  // Le proxy ne vérifie que la validité du JWT, pas le rôle.
  const claims = await getSession();
  if (!claims || claims.role !== "admin") notFound();

  const sb = getSupabaseAdmin();
  const { providers, counts } = await buildAdminOverview(sb);
  const providerEntries = Object.entries(providers);
  const configuredCount = providerEntries.filter(([, ok]) => ok).length;

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      {!sb && <Card title={t.title}><p className="ct-placeholder">{t.degraded}</p></Card>}

      <KpiGrid>
        <KpiCard label={t.estimations} value={String(counts.estimations)} accent />
        <KpiCard label={t.leads} value={String(counts.leads)} />
        <KpiCard label={t.leadsEnriched} value={String(counts.leadsEnriched)} />
        <KpiCard label={t.providersConfigured} value={`${configuredCount}/${providerEntries.length}`} />
      </KpiGrid>

      <Card title={t.providersTitle}>
        {providerEntries.map(([name, ok]) => (
          <div className="est-list-row" key={name}>
            <div className="est-list-info">
              <div className="est-list-main">{name}</div>
            </div>
            <span className={`ct-badge${ok ? "" : " is-muted"}`}>
              {ok ? t.configured : t.absent}
            </span>
          </div>
        ))}
      </Card>

      <Card title={t.obsTitle}><p className="ct-placeholder">{t.obsBody}</p></Card>
      <Card title={t.jobsTitle}><p className="ct-placeholder">{t.jobsPlaceholder}</p></Card>
    </>
  );
}
