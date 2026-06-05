import { notFound } from "next/navigation";
import Link from "next/link";
import { Eyebrow, Title, Sub, Card, Badge } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { eur, dateTimeFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { PropertyStatusControl } from "./_components/PropertyStatusControl";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = UI.properties;
  const tLeads = UI.leads;
  const tVisits = UI.visits;
  const tMandates = UI.mandates;

  const claims = await getSession();
  if (!claims) notFound();

  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  const [
    { data: property },
    { data: leads },
    { data: visits },
    { data: mandates },
  ] = await Promise.all([
    sb
      .from("properties")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single(),
    sb
      .from("leads")
      .select("id, full_name, kind, status, budget_min, budget_max")
      .eq("property_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    sb
      .from("visits")
      .select("id, scheduled_at, status, duration_min")
      .eq("property_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("scheduled_at", { ascending: true }),
    sb
      .from("mandates")
      .select("id, reference, kind, status, commission_pct, asking_price")
      .eq("property_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  if (!property) notFound();

  const displayPrice = property.asking_price ?? property.estimated_value;

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <div className="crm-detail-header">
        <div className="crm-detail-title-row">
          <Title>{property.title ?? t.fallbackTitle}</Title>
          <PropertyStatusControl
            id={id}
            currentStatus={property.status}
            statusLabels={t.statusLabels}
          />
        </div>
        {property.city && <Sub>{property.city}</Sub>}
        {displayPrice != null && (
          <p className="crm-detail-price">
            {eur(displayPrice)}
          </p>
        )}
      </div>

      {/* Caractéristiques */}
      <Card title={t.cardCaracteristiques}>
        <dl className="crm-detail-dl">
          {property.property_type && (
            <>
              <dt>{t.fields.type}</dt>
              <dd>{property.property_type}</dd>
            </>
          )}
          {property.surface != null && (
            <>
              <dt>{t.fields.surface}</dt>
              <dd>{property.surface} m²</dd>
            </>
          )}
          {property.rooms != null && (
            <>
              <dt>{t.fields.rooms}</dt>
              <dd>{property.rooms}</dd>
            </>
          )}
          {property.bedrooms != null && (
            <>
              <dt>{t.fields.bedrooms}</dt>
              <dd>{property.bedrooms}</dd>
            </>
          )}
          {property.address && (
            <>
              <dt>{t.fields.address}</dt>
              <dd>{property.address}</dd>
            </>
          )}
          {property.postal_code && (
            <>
              <dt>{t.fields.postalCode}</dt>
              <dd>{property.postal_code}</dd>
            </>
          )}
          {property.estimation_id && (
            <>
              <dt>{t.fields.estimation}</dt>
              <dd>
                <Link
                  href={`/estimations/${property.estimation_id}`}
                  className="crm-link"
                >
                  {t.seeEstimation}
                </Link>
              </dd>
            </>
          )}
        </dl>
      </Card>

      {/* Leads */}
      <Card title={tLeads.cardTitle}>
        {leads && leads.length > 0 ? (
          <ul className="crm-list">
            {leads.map((lead) => (
              <li key={lead.id} className="crm-list-row">
                <span className="crm-list-name">{lead.full_name}</span>
                <Badge>{tLeads.kindLabels[lead.kind] ?? lead.kind}</Badge>
                {(lead.budget_min != null || lead.budget_max != null) && (
                  <span className="crm-list-meta">
                    {lead.budget_min != null ? eur(lead.budget_min) : ""}
                    {lead.budget_min != null && lead.budget_max != null
                      ? " – "
                      : ""}
                    {lead.budget_max != null ? eur(lead.budget_max) : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{tLeads.empty}</p>
        )}
        <div className="crm-card-footer">
          <Link href="/leads" className="crm-link">
            {tLeads.seeAll}
          </Link>
        </div>
      </Card>

      {/* Visites */}
      <Card title={tVisits.cardTitle}>
        {visits && visits.length > 0 ? (
          <ul className="crm-list">
            {visits.map((visit) => (
              <li key={visit.id} className="crm-list-row">
                <span className="crm-list-name">
                  {dateTimeFr(visit.scheduled_at)}
                </span>
                <Badge>
                  {tVisits.statusLabels[visit.status] ?? visit.status}
                </Badge>
                {visit.duration_min > 0 && (
                  <span className="crm-list-meta">
                    {visit.duration_min} min
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{tVisits.empty}</p>
        )}
      </Card>

      {/* Mandats */}
      <Card title={tMandates.cardTitle}>
        {mandates && mandates.length > 0 ? (
          <ul className="crm-list">
            {mandates.map((mandate) => (
              <li key={mandate.id} className="crm-list-row">
                <span className="crm-list-name">
                  {mandate.reference ?? tMandates.noReference}
                </span>
                <Badge>
                  {tMandates.statusLabels[mandate.status] ?? mandate.status}
                </Badge>
                <Badge>
                  {tMandates.kindLabels[mandate.kind] ?? mandate.kind}
                </Badge>
                {mandate.commission_pct != null && (
                  <span className="crm-list-meta">
                    {mandate.commission_pct}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{tMandates.empty}</p>
        )}
      </Card>
    </>
  );
}
