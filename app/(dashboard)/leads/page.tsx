import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import LeadsBoard from "./_components/LeadsBoard";
import LeadForm from "./_components/LeadForm";

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  kind: string | null;
  type_personne: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  property_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export default async function LeadsPage() {
  const t = UI.leads;
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let leads: Lead[] = [];

  if (claims && sb) {
    const { data } = await sb
      .from("leads")
      .select("id, full_name, email, phone, status, kind, type_personne, source, budget_min, budget_max, property_id, notes, created_at, updated_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    leads = (data ?? []) as Lead[];
  }

  const total = leads.length;
  const won = leads.filter((l) => l.status === "gagne").length;
  const active = leads.filter((l) => l.status !== "gagne" && l.status !== "perdu").length;
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid className="cols-4">
        <KpiCard label={t.kpis.total} value={String(total)} />
        <KpiCard label={t.kpis.active} value={String(active)} />
        <KpiCard label={t.kpis.won} value={String(won)} className="accent" />
        <KpiCard label={t.kpis.conversion} value={`${conversion}%`} />
      </KpiGrid>

      <div className="ct-mb-sm" />

      <LeadForm mode="create" cta={t.newCta} />

      <div className="ct-mb-sm" />

      {leads.length === 0 ? (
        <Card>
          <p className="ct-placeholder">{t.empty}</p>
        </Card>
      ) : (
        <LeadsBoard leads={leads} statusLabels={t.statusLabels} kindLabels={t.kindLabels} />
      )}
    </>
  );
}
