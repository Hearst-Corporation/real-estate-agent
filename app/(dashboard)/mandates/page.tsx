import Link from "next/link";
import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import MandatesList from "./_components/MandatesList";

type MandateRow = {
  id: string;
  status: string;
  kind: string;
  reference: string | null;
  asking_price: number | null;
  commission_pct: number | null;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  properties: { title: string | null; city: string | null } | null;
};

export default async function MandatesPage() {
  const t = UI.mandates;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let mandates: MandateRow[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("mandates")
      .select("*, properties(title, city)")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    mandates = (data ?? []) as MandateRow[];
  }

  const total = mandates.length;
  const actifs = mandates.filter((m) => m.status === "actif");
  const underMandate = actifs.reduce((sum, m) => sum + (m.asking_price ?? 0), 0);
  const commissions = actifs
    .map((m) => m.commission_pct)
    .filter((c): c is number => c !== null);
  const avgCommission =
    commissions.length > 0
      ? commissions.reduce((s, c) => s + c, 0) / commissions.length
      : 0;

  const fmtEur = (v: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <Link href="/mandates/new" className="ct-seg-btn primary">
        {t.newCta}
      </Link>

      <div className="ct-mb-sm" />

      <KpiGrid className="cols-4">
        <KpiCard>
          <span className="ct-kpi-label">{t.kpis.total}</span>
          <span className="ct-kpi-value">{total}</span>
        </KpiCard>
        <KpiCard>
          <span className="ct-kpi-label">{t.kpis.active}</span>
          <span className="ct-kpi-value">{actifs.length}</span>
        </KpiCard>
        <KpiCard className="accent">
          <span className="ct-kpi-label">{t.kpis.underMandate}</span>
          <span className="ct-kpi-value">{fmtEur(underMandate)}</span>
        </KpiCard>
        <KpiCard>
          <span className="ct-kpi-label">{t.kpis.avgCommission}</span>
          <span className="ct-kpi-value">
            {avgCommission > 0 ? `${avgCommission.toFixed(2)}${t.commissionUnit}` : "—"}
          </span>
        </KpiCard>
      </KpiGrid>

      <div className="ct-mb-sm" />

      {mandates.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{t.empty}</p>
        </Card>
      ) : (
        <MandatesList initialMandates={mandates} />
      )}
    </>
  );
}
