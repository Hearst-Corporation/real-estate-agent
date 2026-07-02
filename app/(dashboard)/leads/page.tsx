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

  const stats = [
    { name: t.kpis.total, value: String(total) },
    { name: t.kpis.active, value: String(active) },
    { name: t.kpis.won, value: String(won) },
    { name: t.kpis.conversion, value: `${conversion}%` },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header — headings__page-headings/01-with-actions (dark) */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl">
              {t.title}
            </h1>
          </div>
          <div className="mt-4 flex shrink-0 md:mt-0 md:ml-4">
            <LeadFormModal cta={t.newCta} />
          </div>
        </div>
        <nav aria-label="Tabs" className="-mb-px flex flex-wrap items-center gap-1">
          <PageNavTabs tabs={TAB_GROUPS.clients} />
        </nav>
      </div>

      {/* KPI — data-display__stats/03-simple-in-cards (dark) */}
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* Charts — layout__cards/01-basic-card (dark) conteneur, viz métier conservée */}
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-base font-semibold text-white">{t.charts.pipeline}</h2>
          <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-base font-semibold text-white">{t.charts.conversionRate}</h2>
          <Donut value={conversion} sublabel="Convertis" accent />
        </section>
      </div>

      <LeadsViewToggle leads={leads} />
    </div>
  );
}
