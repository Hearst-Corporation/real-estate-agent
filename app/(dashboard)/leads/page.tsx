import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { Donut } from "@/components/cockpit/Donut";
import { LeadsViewToggle } from "./_components/LeadsViewToggle";
import { countByStatus } from "@/lib/crm/aggregate";
import { LEAD_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { filterSeed } from "@/lib/crm/demo-filter";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import LeadFormModal from "./_components/LeadForm";

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
      .select(
        "id, full_name, email, phone, status, kind, type_personne, source, budget_min, budget_max, property_id, notes, created_at, updated_at"
      )
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("updated_at", { ascending: false });
    leads = filterSeed((data ?? []) as Lead[], (l) => [l.full_name]);
  }

  const total = leads.length;
  const won = leads.filter((l) => l.status === "gagne").length;
  const active = leads.filter((l) => l.status !== "gagne" && l.status !== "perdu").length;
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;

  const pipeline = countByStatus(leads, LEAD_STATUSES, t.statusLabels, (s) =>
    statusTone("lead", s)
  );

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.clients} />}
        action={<LeadFormModal cta={t.newCta} />}
        kpis={[
          { label: t.kpis.total, value: String(total) },
          { label: t.kpis.active, value: String(active) },
          { label: t.kpis.won, value: String(won) },
          { label: t.kpis.conversion, value: `${conversion}%` },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title={t.charts.pipeline} variant="chart">
            <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
          </Card>
        </div>
        <div>
          <Card title={t.charts.conversionRate} variant="chart">
            <Donut value={conversion} sublabel="Convertis" accent />
          </Card>
        </div>
      </div>

      <LeadsViewToggle leads={leads} />
    </PageStack>
  );
}
