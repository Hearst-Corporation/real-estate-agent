import { notFound } from "next/navigation";
import Link from "next/link";
import { Caption, PageHeader, Sub, Card, Badge } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { eur, sqm, dateTimeFr, dateFr, daysSince } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { PropertyStatusControl } from "./_components/PropertyStatusControl";
import { PhotoGallery } from "./_components/PhotoGallery";
import { PhotoUploader } from "./_components/PhotoUploader";
import { DpeBadge } from "./_components/DpeBadge";
import PropertyFormModal from "../_components/PropertyForm";

/** Type étendu property — inclut les colonnes enrichissement (migration agent A). */
type PropertyRow = {
  id: string;
  title: string | null;
  property_type: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  surface: number | null;
  rooms: number | null;
  bedrooms: number | null;
  asking_price: number | null;
  estimated_value: number | null;
  estimation_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  tenant_id: string;
  // colonnes enrichissement
  dpe_letter?: string | null;
  ges_letter?: string | null;
  year_built?: number | null;
  floor?: number | null;
  floor_total?: number | null;
  has_elevator?: boolean;
  has_parking?: boolean;
  has_garden?: boolean;
  has_terrace?: boolean;
  has_pool?: boolean;
  charges_monthly?: number | null;
  taxe_fonciere?: number | null;
  orientation?: string | null;
  cellar?: boolean;
  parking_count?: number | null;
};

type PhotoRow = {
  id: string;
  url: string;
  position: number;
  is_cover: boolean;
};

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;

  const [
    propertyResult,
    { data: leads },
    { data: visits },
    { data: mandates },
    photosResult,
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
    // property_photos : table créée par migration agent A — any pour compatibilité types DB
    sbAny
      .from("property_photos")
      .select("id, url, position, is_cover")
      .eq("property_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true }) as Promise<{ data: PhotoRow[] | null }>,
  ]);

  const property = propertyResult.data as PropertyRow | null;

  if (!property) notFound();

  const displayPrice = property.asking_price ?? property.estimated_value;

  // Calcul jours au portefeuille
  const daysOnMarket = daysSince(property.created_at);

  const photoList = ((photosResult as { data: PhotoRow[] | null }).data ?? []);

  return (
    <>
      {/* Header */}
      <PageHeader
        kicker={t.eyebrow}
        title={property.title ?? t.fallbackTitle}
        meta={
          property.city ? (
            <Sub>{property.city}{property.postal_code ? ` (${property.postal_code})` : ""}</Sub>
          ) : undefined
        }
        action={
          <>
            <PropertyStatusControl
              id={id}
              currentStatus={property.status}
              statusLabels={t.statusLabels}
            />
            <PropertyFormModal
              id={id}
              defaultValues={{
                title: property.title ?? undefined,
                property_type: property.property_type ?? undefined,
                address: property.address ?? undefined,
                city: property.city ?? undefined,
                postal_code: property.postal_code ?? undefined,
                surface: property.surface,
                rooms: property.rooms,
                bedrooms: property.bedrooms,
                asking_price: property.asking_price,
                status: property.status,
                notes: property.notes,
                dpe_letter: property.dpe_letter,
                ges_letter: property.ges_letter,
                year_built: property.year_built,
                floor: property.floor,
                floor_total: property.floor_total,
                has_elevator: property.has_elevator,
                has_parking: property.has_parking,
                has_garden: property.has_garden,
                has_terrace: property.has_terrace,
                has_pool: property.has_pool,
                charges_monthly: property.charges_monthly,
                taxe_fonciere: property.taxe_fonciere,
                orientation: property.orientation,
                cellar: property.cellar,
                parking_count: property.parking_count,
              }}
              triggerLabel={t.editBtn}
            />
          </>
        }
      />
      {displayPrice != null && (
        <p className="crm-detail-price">{eur(displayPrice)}</p>
      )}
      {daysOnMarket !== null && (
        <p className="crm-detail-meta">{t.daysOnMarket(daysOnMarket)}</p>
      )}

      {/* Photos */}
      <Card title={t.photos.title} titleAs="section">
        <PhotoGallery photos={photoList} propertyId={id} />
        <div className="ct-mt-sm">
          <PhotoUploader propertyId={id} />
        </div>
      </Card>

      {/* Caractéristiques */}
      <Card title={t.cardCaracteristiques} titleAs="section">
        <dl className="crm-detail-dl">
          {property.property_type && (
            <><dt>{t.fields.type}</dt><dd>{t.typeLabels[property.property_type] ?? property.property_type}</dd></>
          )}
          {property.surface != null && (
            <><dt>{t.fields.surface}</dt><dd>{sqm(property.surface)}</dd></>
          )}
          {property.rooms != null && (
            <><dt>{t.fields.rooms}</dt><dd>{property.rooms}</dd></>
          )}
          {property.bedrooms != null && (
            <><dt>{t.fields.bedrooms}</dt><dd>{property.bedrooms}</dd></>
          )}
          {property.address && (
            <><dt>{t.fields.address}</dt><dd>{property.address}</dd></>
          )}
          {property.postal_code && (
            <><dt>{t.fields.postalCode}</dt><dd>{property.postal_code}</dd></>
          )}
          {property.estimation_id && (
            <><dt>{t.fields.estimation}</dt>
            <dd><Link href={`/estimations/${property.estimation_id}`} className="crm-link">{t.seeEstimation}</Link></dd></>
          )}
          {property.updated_at && (
            <><dt>Dernière modif.</dt><dd>{dateFr(property.updated_at)}</dd></>
          )}
        </dl>
      </Card>

      {/* DPE / GES */}
      {(property.dpe_letter || property.ges_letter) && (
        <Card title={t.dpe.title} titleAs="section">
          <div className="crm-dpe-row">
            <div className="ct-col-stack-xs">
              <Caption as="span">{t.dpe.label}</Caption>
              <DpeBadge letter={property.dpe_letter} label={t.dpe.label} />
            </div>
            <div className="ct-col-stack-xs">
              <Caption as="span">{t.dpe.gesLabel}</Caption>
              <DpeBadge letter={property.ges_letter} label={t.dpe.gesLabel} />
            </div>
          </div>
        </Card>
      )}

      {/* Enrichissement */}
      {(property.year_built != null || property.floor != null || property.charges_monthly != null ||
        property.has_elevator || property.has_parking || property.has_garden || property.has_terrace ||
        property.has_pool || property.cellar) && (
        <Card title={t.enrichissement.title} titleAs="section">
          <dl className="crm-detail-dl">
            {property.year_built != null && (
              <><dt>{t.enrichissement.yearBuilt}</dt><dd>{property.year_built}</dd></>
            )}
            {property.floor != null && (
              <><dt>{t.enrichissement.floor}</dt>
              <dd>{property.floor}{property.floor_total != null ? ` / ${property.floor_total}` : ""}</dd></>
            )}
            {property.orientation && (
              <><dt>{t.enrichissement.orientation}</dt><dd>{property.orientation}</dd></>
            )}
            {property.charges_monthly != null && (
              <><dt>{t.enrichissement.charges}</dt><dd>{eur(property.charges_monthly)} / mois</dd></>
            )}
            {property.taxe_fonciere != null && (
              <><dt>{t.enrichissement.taxeFonciere}</dt><dd>{eur(property.taxe_fonciere)} / an</dd></>
            )}
            {property.has_elevator && (
              <><dt>{t.enrichissement.elevator}</dt><dd>{t.enrichissement.yes}</dd></>
            )}
            {property.has_parking && (
              <><dt>{t.enrichissement.parking}</dt>
              <dd>{t.enrichissement.yes}{property.parking_count != null ? ` (${property.parking_count} place${property.parking_count > 1 ? "s" : ""})` : ""}</dd></>
            )}
            {property.has_garden && (
              <><dt>{t.enrichissement.garden}</dt><dd>{t.enrichissement.yes}</dd></>
            )}
            {property.has_terrace && (
              <><dt>{t.enrichissement.terrace}</dt><dd>{t.enrichissement.yes}</dd></>
            )}
            {property.has_pool && (
              <><dt>{t.enrichissement.pool}</dt><dd>{t.enrichissement.yes}</dd></>
            )}
            {property.cellar && (
              <><dt>{t.enrichissement.cellar}</dt><dd>{t.enrichissement.yes}</dd></>
            )}
          </dl>
        </Card>
      )}

      {/* Leads */}
      <Card title={tLeads.cardTitle} titleAs="section">
        {leads && leads.length > 0 ? (
          <ul className="crm-list">
            {leads.map((lead) => (
              <li key={lead.id} className="crm-list-row">
                <span className="crm-list-name">{lead.full_name}</span>
                <Badge>{tLeads.kindLabels[lead.kind] ?? lead.kind}</Badge>
                {(lead.budget_min != null || lead.budget_max != null) && (
                  <span className="crm-list-meta">
                    {lead.budget_min != null ? eur(lead.budget_min) : ""}
                    {lead.budget_min != null && lead.budget_max != null ? " – " : ""}
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
          <Link href="/leads" className="crm-link">{tLeads.seeAll}</Link>
        </div>
      </Card>

      {/* Visites */}
      <Card title={tVisits.cardTitle} titleAs="section">
        {visits && visits.length > 0 ? (
          <ul className="crm-list">
            {visits.map((visit) => (
              <li key={visit.id} className="crm-list-row">
                <span className="crm-list-name">{dateTimeFr(visit.scheduled_at)}</span>
                <Badge>{tVisits.statusLabels[visit.status] ?? visit.status}</Badge>
                {visit.duration_min > 0 && (
                  <span className="crm-list-meta">{visit.duration_min} min</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{tVisits.empty}</p>
        )}
      </Card>

      {/* Mandats */}
      <Card title={tMandates.cardTitle} titleAs="section">
        {mandates && mandates.length > 0 ? (
          <ul className="crm-list">
            {mandates.map((mandate) => (
              <li key={mandate.id} className="crm-list-row">
                <span className="crm-list-name">{mandate.reference ?? tMandates.noReference}</span>
                <Badge>{tMandates.statusLabels[mandate.status] ?? mandate.status}</Badge>
                <Badge>{tMandates.kindLabels[mandate.kind] ?? mandate.kind}</Badge>
                {mandate.commission_pct != null && (
                  <span className="crm-list-meta">{mandate.commission_pct}%</span>
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
