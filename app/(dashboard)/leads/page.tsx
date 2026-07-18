import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { Funnel } from "@/components/cockpit/Funnel";
import { Donut } from "@/components/cockpit/Donut";
import { Heading, Subheading } from "@/components/ui/heading";
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
      .order("updated_at", { ascending: false })
      .limit(200);
    leads = filterSeed((data ?? []) as Lead[], (l) => [l.full_name]);
  }

  const total = leads.length;
  const won = leads.filter((l) => l.status === "gagne").length;
  const active = leads.filter((l) => l.status !== "gagne" && l.status !== "perdu").length;
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;

  const pipeline = countByStatus(leads, LEAD_STATUSES, t.statusLabels, (s) =>
    statusTone("lead", s)
  );

  const stats = [
    { name: t.kpis.total, value: String(total) },
    { name: t.kpis.active, value: String(active) },
    { name: t.kpis.won, value: String(won) },
    { name: t.kpis.conversion, value: `${conversion}%` },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-950/10 pb-5 dark:border-white/10">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
              {t.eyebrow}
            </p>
            <Heading>{t.title}</Heading>
          </div>
          <div className="mt-4 flex shrink-0 md:mt-0 md:ml-4">
            <LeadFormModal cta={t.newCta} />
          </div>
        </div>
        <nav aria-label="Tabs" className="-mb-px flex flex-wrap items-center gap-1">
          <PageNavTabs tabs={TAB_GROUPS.clients} />
        </nav>
      </div>

      {/* KPI — cartes surface, chiffre grand */}
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="surface overflow-hidden px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-zinc-500">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Charts — cartes surface, viz métier conservée */}
      <div className="grid grid-cols-1 items-start gap-6 @2xl:grid-cols-2">
        <section className="surface p-5">
          <Subheading className="font-titre mb-3">{t.charts.pipeline}</Subheading>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="surface p-5">
          <Subheading className="font-titre mb-3">{t.charts.conversionRate}</Subheading>
          <Donut value={conversion} sublabel="Convertis" accent />
        </section>
      </div>

      <LeadsViewToggle leads={leads} />
    </div>
  );
}
