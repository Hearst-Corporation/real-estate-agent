import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { Card } from "@/components/cockpit/primitives";
import { Badge } from "@/components/ui/badge";
import { UI } from "@/lib/ui-strings";
import { eur, dateTimeFr } from "@/lib/crm/format";

interface Props {
  propertyId: string;
  userId: string;
  tenantId: string;
}

export async function PropertyRelatedSection({ propertyId, userId, tenantId }: Props) {
  const td = UI.properties.detail;
  const tLeads = UI.leads;
  const tVisits = UI.visits;
  const tMandates = UI.mandates;

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const [{ data: leads }, { data: visits }, { data: mandates }] = await Promise.all([
    sb
      .from("leads")
      .select("id, full_name, kind, status, budget_min, budget_max")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    sb
      .from("visits")
      .select("id, scheduled_at, status, duration_min")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("scheduled_at", { ascending: true }),
    sb
      .from("mandates")
      .select("id, reference, kind, status, commission_pct, asking_price")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      {/* ── Leads ────────────────────────────────────────────────────────── */}
      <Card title={td.cardLeads}>
        {leads && leads.length > 0 ? (
          <ul className="flex flex-col divide-y divide-white/5">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-col gap-1 py-2.5">
                <span className="text-sm font-medium text-slate-100">{lead.full_name}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{tLeads.kindLabels[lead.kind] ?? lead.kind}</Badge>
                  <Badge>{tLeads.statusLabels[lead.status] ?? lead.status}</Badge>
                </div>
                {(lead.budget_min != null || lead.budget_max != null) && (
                  <span className="text-xs text-slate-500">
                    {lead.budget_min != null ? eur(lead.budget_min) : ""}
                    {lead.budget_min != null && lead.budget_max != null ? " – " : ""}
                    {lead.budget_max != null ? eur(lead.budget_max) : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-slate-500">{td.leadsEmpty}</p>
        )}
        <div className="mt-3 border-t border-white/10 pt-3">
          <Link href="/leads" className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
            {td.seeAllLeads}
          </Link>
        </div>
      </Card>

      {/* ── Visites ──────────────────────────────────────────────────────── */}
      <Card title={td.cardVisites}>
        {visits && visits.length > 0 ? (
          <ul className="flex flex-col divide-y divide-white/5">
            {visits.map((visit) => (
              <li key={visit.id} className="flex flex-col gap-1 py-2.5">
                <span className="text-sm font-medium text-slate-100">{dateTimeFr(visit.scheduled_at)}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{tVisits.statusLabels[visit.status] ?? visit.status}</Badge>
                </div>
                {visit.duration_min > 0 && (
                  <span className="text-xs text-slate-500">{td.visitDuration(visit.duration_min)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-slate-500">{td.visitsEmpty}</p>
        )}
      </Card>

      {/* ── Mandats ──────────────────────────────────────────────────────── */}
      <Card title={td.cardMandats}>
        {mandates && mandates.length > 0 ? (
          <ul className="flex flex-col divide-y divide-white/5">
            {mandates.map((mandate) => (
              <li key={mandate.id} className="flex flex-col gap-1 py-2.5">
                <span className="text-sm font-medium text-slate-100">
                  {mandate.reference ?? td.mandateRef}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{tMandates.statusLabels[mandate.status] ?? mandate.status}</Badge>
                  <Badge>{tMandates.kindLabels[mandate.kind] ?? mandate.kind}</Badge>
                </div>
                {mandate.commission_pct != null && (
                  <span className="text-xs text-slate-500">{td.commission(mandate.commission_pct)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-slate-500">{td.mandatesEmpty}</p>
        )}
      </Card>
    </>
  );
}
