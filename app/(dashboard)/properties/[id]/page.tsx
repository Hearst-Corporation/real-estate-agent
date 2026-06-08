import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { eur, sqm, dateFr, daysSince } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { PropertyStatusControl } from "./_components/PropertyStatusControl";
import { DpeBadge } from "./_components/DpeBadge";
import PropertyFormModal from "../_components/PropertyForm";
import { PropertyPhotosSection } from "./_components/PropertyPhotosSection";
import { PropertyRelatedSection } from "./_components/PropertyRelatedSection";

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

/** Skeleton léger pour les sections en cours de chargement. */
function SectionSkeleton() {
  return (
    <div
      className="crm-skeleton-card"
      style={{
        height: "6rem",
        borderRadius: "var(--ct-radius-md, 8px)",
        background: "var(--ct-surface-2, rgba(255,255,255,0.04))",
        animation: "ct-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = UI.properties;
  const td = UI.properties.detail;

  // ── Auth (core) ───────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) notFound();

  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // ── Donnée COEUR : property uniquement (notFound + shell dépend de ça) ──
  const { data: propertyData } = await sb
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const property = propertyData as PropertyRow | null;
  if (!property) notFound();

  const displayPrice = property.asking_price ?? property.estimated_value;
  const pricePerSqm =
    displayPrice != null && property.surface != null && property.surface > 0
      ? Math.round(displayPrice / property.surface)
      : null;

  const daysOnMarket = daysSince(property.created_at);

  // Équipements présents
  type EquipItem = { key: string; icon: string; label: string };
  const equipItems: EquipItem[] = [
    property.has_elevator ? { key: "elevator", icon: "⬆", label: td.equipElevator } : null,
    property.has_parking
      ? {
          key: "parking",
          icon: "🅿",
          label:
            property.parking_count != null
              ? `${td.equipParking} · ${td.gridParkingPlaces(property.parking_count)}`
              : td.equipParking,
        }
      : null,
    property.has_garden ? { key: "garden", icon: "🌿", label: td.equipGarden } : null,
    property.has_terrace ? { key: "terrace", icon: "☀", label: td.equipTerrace } : null,
    property.has_pool ? { key: "pool", icon: "🏊", label: td.equipPool } : null,
    property.cellar ? { key: "cellar", icon: "🗝", label: td.equipCellar } : null,
  ].filter((x): x is EquipItem => x !== null);

  // Lien Maps
  const mapsQuery =
    property.address && property.city
      ? encodeURIComponent(`${property.address}, ${property.city} ${property.postal_code ?? ""}`)
      : property.city
      ? encodeURIComponent(`${property.city} ${property.postal_code ?? ""}`)
      : null;

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <PageHeader
        kicker={t.eyebrow}
        title={property.title ?? t.fallbackTitle}
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

      {/* ── Hero prix ─────────────────────────────────────────────────────── */}
      <div className="crm-detail-hero">
        {displayPrice != null && (
          <div className="crm-detail-hero-price-row">
            <span className="crm-detail-hero-price">{eur(displayPrice)}</span>
            {pricePerSqm != null && (
              <span className="crm-detail-hero-sqm">
                {td.pricePerSqm(eur(pricePerSqm))}
              </span>
            )}
          </div>
        )}

        {/* Chips résumé — type · surface · pièces · chambres · étage · DPE */}
        <div className="crm-detail-hero-chips">
          {property.property_type && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">🏠</span>
              {t.typeLabels[property.property_type] ?? property.property_type}
            </span>
          )}
          {property.surface != null && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">📐</span>
              {sqm(property.surface)}
            </span>
          )}
          {property.rooms != null && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">🚪</span>
              {td.chipRooms(property.rooms)}
            </span>
          )}
          {property.bedrooms != null && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">🛏</span>
              {td.chipBedrooms(property.bedrooms)}
            </span>
          )}
          {property.floor != null && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">🏢</span>
              {td.chipFloor(property.floor, property.floor_total)}
            </span>
          )}
          {property.dpe_letter && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">⚡</span>
              {"DPE "}{property.dpe_letter}
            </span>
          )}
          {property.city && (
            <span className="crm-detail-hero-chip">
              <span className="crm-detail-hero-chip-icon">📍</span>
              {property.city}
              {property.postal_code ? ` ${property.postal_code}` : ""}
            </span>
          )}
        </div>

        {daysOnMarket !== null && (
          <span className="crm-detail-hero-days">{t.daysOnMarket(daysOnMarket)}</span>
        )}
      </div>

      {/* ── Photos (secondaire — streamée) ────────────────────────────────── */}
      <Suspense fallback={<SectionSkeleton />}>
        <PropertyPhotosSection
          propertyId={id}
          userId={userId}
          tenantId={tenantId}
        />
      </Suspense>

      {/* ── Caractéristiques ─────────────────────────────────────────────── */}
      <Card title={td.cardCaracteristiques}>
        <div className="crm-detail-grid">
          {property.surface != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{t.fields.surface}</span>
              <span className="crm-detail-grid-value-accent">{sqm(property.surface)}</span>
            </div>
          )}
          {displayPrice != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">
                {property.asking_price != null
                  ? td.priceType.asking
                  : td.priceType.estimated}
              </span>
              <span className="crm-detail-grid-value-accent">{eur(displayPrice)}</span>
            </div>
          )}
          {pricePerSqm != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{"Prix / m²"}</span>
              <span className="crm-detail-grid-value">{eur(pricePerSqm)}</span>
            </div>
          )}
          {property.rooms != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{t.fields.rooms}</span>
              <span className="crm-detail-grid-value">{property.rooms}</span>
            </div>
          )}
          {property.bedrooms != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{t.fields.bedrooms}</span>
              <span className="crm-detail-grid-value">{property.bedrooms}</span>
            </div>
          )}
          {property.floor != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{t.enrichissement.floor}</span>
              <span className="crm-detail-grid-value">
                {property.floor}
                {property.floor_total != null ? ` / ${property.floor_total}` : ""}
              </span>
            </div>
          )}
          {property.year_built != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{td.gridYearBuilt}</span>
              <span className="crm-detail-grid-value">{property.year_built}</span>
            </div>
          )}
          {property.orientation && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{td.gridOrientation}</span>
              <span className="crm-detail-grid-value">{property.orientation}</span>
            </div>
          )}
          {property.charges_monthly != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{td.gridCharges}</span>
              <span className="crm-detail-grid-value">
                {eur(property.charges_monthly)}{" "}{td.gridChargesSuffix}
              </span>
            </div>
          )}
          {property.taxe_fonciere != null && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{td.gridTaxe}</span>
              <span className="crm-detail-grid-value">
                {eur(property.taxe_fonciere)}{" "}{td.gridTaxeSuffix}
              </span>
            </div>
          )}
          {property.estimation_id && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{t.fields.estimation}</span>
              <span className="crm-detail-grid-value">
                <Link href={`/estimations/${property.estimation_id}`} className="crm-link">
                  {t.seeEstimation}
                </Link>
              </span>
            </div>
          )}
          {property.updated_at && (
            <div className="crm-detail-grid-item">
              <span className="crm-detail-grid-label">{td.gridUpdated}</span>
              <span className="crm-detail-grid-value">{dateFr(property.updated_at)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Équipements ──────────────────────────────────────────────────── */}
      {equipItems.length > 0 && (
        <Card title={td.cardEquipements}>
          <div className="crm-detail-equip-grid">
            {equipItems.map((eq) => (
              <span key={eq.key} className="crm-detail-equip-pill">
                <span className="crm-detail-equip-pill-icon">{eq.icon}</span>
                {eq.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ── Localisation ─────────────────────────────────────────────────── */}
      {(property.address || property.city) && (
        <Card title={td.cardLocalisation}>
          <div className="crm-detail-location">
            {property.address && (
              <span className="crm-detail-location-address">{property.address}</span>
            )}
            {property.city && (
              <span className="crm-detail-location-city">
                {[property.postal_code, property.city].filter(Boolean).join(" ")}
              </span>
            )}
            {mapsQuery && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="crm-detail-location-link"
              >
                <span>{"📍"}</span>
                {td.locMapsLink}
              </a>
            )}
          </div>
        </Card>
      )}

      {/* ── DPE / GES ────────────────────────────────────────────────────── */}
      {(property.dpe_letter || property.ges_letter) && (
        <Card title={td.cardDpe}>
          <div className="crm-dpe-premium">
            {property.dpe_letter && (
              <div className="crm-dpe-premium-item">
                <DpeBadge letter={property.dpe_letter} label={t.dpe.label} />
                <div className="crm-dpe-premium-info">
                  <span className="crm-dpe-premium-label">{t.dpe.label}</span>
                  <span className="crm-dpe-premium-desc">{td.dpeNote(property.dpe_letter)}</span>
                </div>
              </div>
            )}
            {property.ges_letter && (
              <div className="crm-dpe-premium-item">
                <DpeBadge letter={property.ges_letter} label={t.dpe.gesLabel} />
                <div className="crm-dpe-premium-info">
                  <span className="crm-dpe-premium-label">{t.dpe.gesLabel}</span>
                  <span className="crm-dpe-premium-desc">{td.gesNote(property.ges_letter)}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Notes internes ───────────────────────────────────────────────── */}
      <Card title={td.cardNotes}>
        {property.notes ? (
          <p className="crm-detail-notes">{property.notes}</p>
        ) : (
          <p className="ct-placeholder">{td.notesEmpty}</p>
        )}
      </Card>

      {/* ── Leads + Visites + Mandats (secondaires — streamés) ───────────── */}
      <Suspense
        fallback={
          <>
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        }
      >
        <PropertyRelatedSection
          propertyId={id}
          userId={userId}
          tenantId={tenantId}
        />
      </Suspense>
    </>
  );
}
