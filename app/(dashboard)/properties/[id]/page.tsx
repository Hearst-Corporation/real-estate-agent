import { Fragment, Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DescriptionList, DescriptionTerm, DescriptionDetails } from "@/components/ui/description-list";
import { UI } from "@/lib/ui-strings";
import { eur, sqm, dateFr, daysSince } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
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
  return <div className="h-24 animate-pulse rounded-lg bg-zinc-950/[0.04]" />;
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

  const sb = getGpu1Admin();
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

  // Lignes de la description-list « Caractéristiques » (bloc TW+
  // data-display__description-lists/02-left-aligned-in-card, adapté sombre).
  // On construit un tableau { label, value } filtré sur les champs présents,
  // puis on le rend via <dl> divisée — plus de grille label/valeur maison.
  const caracteristiques = ([
    property.surface != null
      ? { key: "surface", label: t.fields.surface, value: sqm(property.surface) }
      : null,
    displayPrice != null
      ? {
          key: "price",
          label: property.asking_price != null ? td.priceType.asking : td.priceType.estimated,
          value: eur(displayPrice),
        }
      : null,
    pricePerSqm != null
      ? { key: "pricePerSqm", label: "Prix / m²", value: eur(pricePerSqm) }
      : null,
    property.rooms != null
      ? { key: "rooms", label: t.fields.rooms, value: property.rooms }
      : null,
    property.bedrooms != null
      ? { key: "bedrooms", label: t.fields.bedrooms, value: property.bedrooms }
      : null,
    property.floor != null
      ? {
          key: "floor",
          label: t.enrichissement.floor,
          value: `${property.floor}${property.floor_total != null ? ` / ${property.floor_total}` : ""}`,
        }
      : null,
    property.year_built != null
      ? { key: "yearBuilt", label: td.gridYearBuilt, value: property.year_built }
      : null,
    property.orientation
      ? { key: "orientation", label: td.gridOrientation, value: property.orientation }
      : null,
    property.charges_monthly != null
      ? {
          key: "charges",
          label: td.gridCharges,
          value: `${eur(property.charges_monthly)} ${td.gridChargesSuffix}`,
        }
      : null,
    property.taxe_fonciere != null
      ? {
          key: "taxe",
          label: td.gridTaxe,
          value: `${eur(property.taxe_fonciere)} ${td.gridTaxeSuffix}`,
        }
      : null,
    property.estimation_id
      ? {
          key: "estimation",
          label: t.fields.estimation,
          value: (
            <Link
              href={`/estimations/${property.estimation_id}`}
              className="font-semibold text-accent-600 hover:text-accent-500"
            >
              {t.seeEstimation}
            </Link>
          ),
        }
      : null,
    property.updated_at
      ? { key: "updated", label: td.gridUpdated, value: dateFr(property.updated_at) }
      : null,
  ] as { key: string; label: string; value: ReactNode }[]).filter(Boolean) as {
    key: string;
    label: string;
    value: ReactNode;
  }[];

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
    <PageStack>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <PageHeader
        kicker={t.eyebrow}
        title={property.title ?? t.fallbackTitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button href={`/estimations/new?property=${id}`}>
              {t.estimateThisProperty}
            </Button>
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
          </div>
        }
      />

      {/* ── Hero prix ─────────────────────────────────────────────────────── */}
      <div className="surface p-6">
        {displayPrice != null && (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-semibold tracking-tight text-accent-600 tabular-nums">{eur(displayPrice)}</span>
            {pricePerSqm != null && (
              <span className="text-sm text-zinc-500">{td.pricePerSqm(eur(pricePerSqm))}</span>
            )}
          </div>
        )}

        {/* Chips résumé — type · surface · pièces · chambres · étage · DPE */}
        <div className="mt-4 flex flex-wrap gap-2">
          {property.property_type && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">🏠</span>
              {t.typeLabels[property.property_type] ?? property.property_type}
            </span>
          )}
          {property.surface != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">📐</span>
              {sqm(property.surface)}
            </span>
          )}
          {property.rooms != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">🚪</span>
              {td.chipRooms(property.rooms)}
            </span>
          )}
          {property.bedrooms != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">🛏</span>
              {td.chipBedrooms(property.bedrooms)}
            </span>
          )}
          {property.floor != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">🏢</span>
              {td.chipFloor(property.floor, property.floor_total)}
            </span>
          )}
          {property.dpe_letter && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">⚡</span>
              {"DPE "}{property.dpe_letter}
            </span>
          )}
          {property.city && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1 text-xs font-medium text-zinc-700">
              <span aria-hidden="true">📍</span>
              {property.city}
              {property.postal_code ? ` ${property.postal_code}` : ""}
            </span>
          )}
        </div>

        {daysOnMarket !== null && (
          <span className="mt-3 block text-xs text-zinc-500">{t.daysOnMarket(daysOnMarket)}</span>
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
      {/* Description-list Catalyst (data-display__description-lists) : term/detail. */}
      <Card title={td.cardCaracteristiques}>
        <DescriptionList>
          {caracteristiques.map((c) => (
            <Fragment key={c.key}>
              <DescriptionTerm>{c.label}</DescriptionTerm>
              <DescriptionDetails>{c.value}</DescriptionDetails>
            </Fragment>
          ))}
        </DescriptionList>
      </Card>

      {/* ── Équipements ──────────────────────────────────────────────────── */}
      {equipItems.length > 0 && (
        <Card title={td.cardEquipements}>
          <div className="flex flex-wrap gap-2">
            {equipItems.map((eq) => (
              <span
                key={eq.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-zinc-950/5 px-3 py-1.5 text-sm text-zinc-700"
              >
                <span aria-hidden="true">{eq.icon}</span>
                {eq.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ── Localisation ─────────────────────────────────────────────────── */}
      {(property.address || property.city) && (
        <Card title={td.cardLocalisation}>
          <div className="flex flex-col gap-1.5">
            {property.address && (
              <span className="text-sm text-zinc-700">{property.address}</span>
            )}
            {property.city && (
              <span className="text-sm text-zinc-500">
                {[property.postal_code, property.city].filter(Boolean).join(" ")}
              </span>
            )}
            {mapsQuery && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-500"
              >
                <span aria-hidden="true">{"📍"}</span>
                {td.locMapsLink}
              </a>
            )}
          </div>
        </Card>
      )}

      {/* ── DPE / GES ────────────────────────────────────────────────────── */}
      {(property.dpe_letter || property.ges_letter) && (
        <Card title={td.cardDpe}>
          <div className="flex flex-wrap gap-6">
            {property.dpe_letter && (
              <div className="flex items-center gap-3">
                <DpeBadge letter={property.dpe_letter} label={t.dpe.label} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-zinc-900">{t.dpe.label}</span>
                  <span className="text-xs text-zinc-500">{td.dpeNote(property.dpe_letter)}</span>
                </div>
              </div>
            )}
            {property.ges_letter && (
              <div className="flex items-center gap-3">
                <DpeBadge letter={property.ges_letter} label={t.dpe.gesLabel} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-zinc-900">{t.dpe.gesLabel}</span>
                  <span className="text-xs text-zinc-500">{td.gesNote(property.ges_letter)}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Notes internes ───────────────────────────────────────────────── */}
      <Card title={td.cardNotes}>
        {property.notes ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-700">{property.notes}</p>
        ) : (
          <p className="text-sm text-zinc-500">{td.notesEmpty}</p>
        )}
      </Card>

      {/* ── Leads + Visites + Mandats (secondaires — streamés) ───────────── */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        }
      >
        <PropertyRelatedSection
          propertyId={id}
          userId={userId}
          tenantId={tenantId}
        />
      </Suspense>
    </PageStack>
  );
}
