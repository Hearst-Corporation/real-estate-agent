import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard, Badge } from "@/components/cockpit/primitives";
import { Funnel } from "@/components/cockpit/Funnel";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { countByStatus } from "@/lib/crm/aggregate";
import { eur, LEAD_STATUSES } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import LeadFormModal from "./_components/LeadForm";
import { LeadRowActions } from "./_components/LeadRowActions";

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

/** Formate une fourchette de budget en € (gère les bornes manquantes). */
function budgetRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${eur(min)} – ${eur(max)}`;
  if (min != null) return `≥ ${eur(min)}`;
  if (max != null) return `≤ ${eur(max)}`;
  return "—";
}

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
    leads = (data ?? []) as Lead[];
  }

  const total = leads.length;
  const won = leads.filter((l) => l.status === "gagne").length;
  const active = leads.filter((l) => l.status !== "gagne" && l.status !== "perdu").length;
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;

  const pipeline = countByStatus(leads, LEAD_STATUSES, t.statusLabels, (s) =>
    statusTone("lead", s)
  );

  const columns: Column<Lead>[] = [
    { key: "name", header: t.table.name, render: (l) => l.full_name },
    {
      key: "kind",
      header: t.table.kind,
      render: (l) => (l.kind ? <Badge>{t.kindLabels[l.kind] ?? l.kind}</Badge> : "—"),
    },
    {
      key: "status",
      header: t.table.status,
      render: (l) => (
        <StatusSelect
          endpoint={`/api/leads/${l.id}`}
          value={l.status}
          options={LEAD_STATUSES}
          labels={t.statusLabels}
          ariaLabel={t.table.status}
        />
      ),
    },
    {
      key: "budget",
      header: t.table.budget,
      align: "right",
      render: (l) => budgetRange(l.budget_min, l.budget_max),
    },
    { key: "source", header: t.table.source, render: (l) => l.source ?? "—" },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (l) => (
        <LeadRowActions
          id={l.id}
          fullName={l.full_name}
          defaultValues={{
            full_name: l.full_name,
            email: l.email,
            phone: l.phone,
            source: l.source,
            kind: l.kind,
            type_personne: l.type_personne,
            budget_min: l.budget_min,
            budget_max: l.budget_max,
            status: l.status,
          }}
        />
      ),
    },
  ];

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <KpiGrid>
        <KpiCard label={t.kpis.total} value={String(total)} />
        <KpiCard label={t.kpis.active} value={String(active)} />
        <KpiCard label={t.kpis.won} value={String(won)} accent />
        <KpiCard label={t.kpis.conversion} value={`${conversion}%`} />
      </KpiGrid>

      <Card title={t.charts.pipeline}>
        <Funnel steps={pipeline} emptyLabel={UI.viz.empty} />
      </Card>

      <div className="crm-toolbar">
        <span className="ct-card-title">{t.cardTitle}</span>
        <LeadFormModal cta={t.newCta} />
      </div>

      <Card>
        <DataTable columns={columns} rows={leads} emptyLabel={t.empty} getKey={(l) => l.id} />
      </Card>
    </>
  );
}
