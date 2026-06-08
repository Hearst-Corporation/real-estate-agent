import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { Card, Badge } from "@/components/cockpit/primitives";
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
          <ul className="crm-related-list">
            {leads.map((lead) => (
              <li key={lead.id} className="crm-related-row">
                <span className="crm-related-primary">{lead.full_name}</span>
                <div className="crm-related-badges">
                  <Badge>{tLeads.kindLabels[lead.kind] ?? lead.kind}</Badge>
                  <Badge>{tLeads.statusLabels[lead.status] ?? lead.status}</Badge>
                </div>
                {(lead.budget_min != null || lead.budget_max != null) && (
                  <span className="crm-related-secondary">
                    {lead.budget_min != null ? eur(lead.budget_min) : ""}
                    {lead.budget_min != null && lead.budget_max != null ? " – " : ""}
                    {lead.budget_max != null ? eur(lead.budget_max) : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{td.leadsEmpty}</p>
        )}
        <div className="crm-card-footer">
          <Link href="/leads" className="crm-link">{td.seeAllLeads}</Link>
        </div>
      </Card>

      {/* ── Visites ──────────────────────────────────────────────────────── */}
      <Card title={td.cardVisites}>
        {visits && visits.length > 0 ? (
          <ul className="crm-related-list">
            {visits.map((visit) => (
              <li key={visit.id} className="crm-related-row">
                <span className="crm-related-primary">{dateTimeFr(visit.scheduled_at)}</span>
                <div className="crm-related-badges">
                  <Badge>{tVisits.statusLabels[visit.status] ?? visit.status}</Badge>
                </div>
                {visit.duration_min > 0 && (
                  <span className="crm-related-secondary">{td.visitDuration(visit.duration_min)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{td.visitsEmpty}</p>
        )}
      </Card>

      {/* ── Mandats ──────────────────────────────────────────────────────── */}
      <Card title={td.cardMandats}>
        {mandates && mandates.length > 0 ? (
          <ul className="crm-related-list">
            {mandates.map((mandate) => (
              <li key={mandate.id} className="crm-related-row">
                <span className="crm-related-primary">
                  {mandate.reference ?? td.mandateRef}
                </span>
                <div className="crm-related-badges">
                  <Badge>{tMandates.statusLabels[mandate.status] ?? mandate.status}</Badge>
                  <Badge>{tMandates.kindLabels[mandate.kind] ?? mandate.kind}</Badge>
                </div>
                {mandate.commission_pct != null && (
                  <span className="crm-related-secondary">{td.commission(mandate.commission_pct)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{td.mandatesEmpty}</p>
        )}
      </Card>
    </>
  );
}
