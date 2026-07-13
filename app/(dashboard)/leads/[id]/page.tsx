import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarIcon,
  TagIcon,
} from "@heroicons/react/20/solid";
import { UI } from "@/lib/ui-strings";
import { eur, dateFr, dateTimeFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { isEnrichable } from "@/lib/crm/enrichable";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from "@/components/ui/description-list";
import { LeadEnrichButton } from "../_components/LeadEnrichButton";

// ─── Types ───────────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  status: string;
  kind: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  property_id: string | null;
  notes: string | null;
  type_personne: string | null;
  consent_at: string | null;
  enriched_at: string | null;
  enriched_source: string | null;
  enriched_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CritereRow = {
  id: string;
  nom: string | null;
  type_bien: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  surface_min: number | null;
  surface_max: number | null;
  pieces_min: number | null;
  pieces_max: number | null;
  zones: unknown;
  terrasse: boolean | null;
  parking: boolean | null;
  ascenseur: boolean | null;
  jardin: boolean | null;
  piscine: boolean | null;
  dpe_max: string | null;
  actif: boolean | null;
};

type VisitRow = {
  id: string;
  scheduled_at: string;
  status: string;
  duration_min: number | null;
  properties: { title: string | null; city: string | null } | null;
};

type PropertyRow = {
  id: string;
  title: string | null;
  city: string | null;
  asking_price: number | null;
  property_type: string | null;
};

// ─── UI primitives (Catalyst) ──────────────────────────────────────────────────

/** Card conteneur — panneau zinc + Subheading. */
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="px-6 py-5">
        <Subheading>{title}</Subheading>
      </div>
      <div className="border-t border-zinc-950/10 px-6 py-5 dark:border-white/10">{children}</div>
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatZones(zones: unknown): string {
  if (!zones) return "—";
  if (Array.isArray(zones)) return (zones as string[]).join(", ");
  if (typeof zones === "string") return zones;
  try {
    const parsed = JSON.parse(JSON.stringify(zones));
    if (Array.isArray(parsed)) return (parsed as string[]).join(", ");
  } catch {
    // ignore
  }
  return "—";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = UI.leads;
  const td = UI.leads.detail;
  const tVisits = UI.visits;

  const claims = await getSession();
  if (!claims) notFound();

  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;

  const [
    leadResult,
    criteresResult,
    visitsResult,
  ] = await Promise.all([
    // Lead principal
    sb
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single(),
    // Critères de recherche acquéreur liés à ce lead
    sbAny
      .from("prosp_criteres_acquereur")
      .select(
        "id, nom, type_bien, budget_min, budget_max, surface_min, surface_max, pieces_min, pieces_max, zones, terrasse, parking, ascenseur, jardin, piscine, dpe_max, actif"
      )
      .eq("lead_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }) as Promise<{ data: CritereRow[] | null }>,
    // Visites liées au lead avec join sur properties
    sbAny
      .from("visits")
      .select("id, scheduled_at, status, duration_min, properties(title, city)")
      .eq("lead_id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("scheduled_at", { ascending: true }) as Promise<{ data: VisitRow[] | null }>,
  ]);

  const lead = leadResult.data as LeadRow | null;
  if (!lead) notFound();

  // Bien lié : chargé séparément si property_id est défini
  let linkedProperty: PropertyRow | null = null;
  if (lead.property_id) {
    const { data } = await sb
      .from("properties")
      .select("id, title, city, asking_price, property_type")
      .eq("id", lead.property_id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single();
    linkedProperty = data as PropertyRow | null;
  }

  const criteres = (criteresResult.data ?? []) as CritereRow[];
  const visits = (visitsResult.data ?? []) as VisitRow[];

  // Kicker : acheteur / vendeur / fallback
  const eyebrow =
    lead.kind === "acheteur"
      ? td.eyebrowAcheteur
      : lead.kind === "vendeur"
      ? td.eyebrowVendeur
      : td.eyebrowFallback;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-zinc-950/10 pb-5 lg:flex-row lg:items-center lg:justify-between dark:border-white/10">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
            {eyebrow}
          </p>
          <Heading>{lead.full_name ?? td.fallbackName}</Heading>
          <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
            <div className="mt-2 flex items-center text-sm text-zinc-500 dark:text-zinc-400">
              <Badge color="zinc">{t.statusLabels[lead.status] ?? lead.status}</Badge>
            </div>
            {lead.source && (
              <div className="mt-2 flex items-center text-sm text-zinc-500 dark:text-zinc-400">
                <TagIcon aria-hidden="true" className="mr-1.5 size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                {lead.source}
              </div>
            )}
            {lead.created_at && (
              <div className="mt-2 flex items-center text-sm text-zinc-500 dark:text-zinc-400">
                <CalendarIcon aria-hidden="true" className="mr-1.5 size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                {td.fields.createdAt} {dateFr(lead.created_at)}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex shrink-0 lg:mt-0 lg:ml-4">
          <Button href="/leads" outline>
            <ArrowLeftIcon />
            {td.backLink}
          </Button>
        </div>
      </div>

      {/* ── Identité & contact ── */}
      <DetailCard title={td.cardIdentite}>
        <DescriptionList>
          {lead.email && (
            <>
              <DescriptionTerm>{td.fields.email}</DescriptionTerm>
              <DescriptionDetails>
                <Link
                  href={`mailto:${lead.email}`}
                  className="text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                >
                  {lead.email}
                </Link>
              </DescriptionDetails>
            </>
          )}
          {lead.phone && (
            <>
              <DescriptionTerm>{td.fields.phone}</DescriptionTerm>
              <DescriptionDetails>
                <Link
                  href={`tel:${lead.phone}`}
                  className="text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                >
                  {lead.phone}
                </Link>
              </DescriptionDetails>
            </>
          )}
          {lead.source && (
            <>
              <DescriptionTerm>{td.fields.source}</DescriptionTerm>
              <DescriptionDetails>{lead.source}</DescriptionDetails>
            </>
          )}
          {lead.type_personne && (
            <>
              <DescriptionTerm>{td.fields.typePersonne}</DescriptionTerm>
              <DescriptionDetails>
                {t.typePersonneLabels[lead.type_personne] ?? lead.type_personne}
              </DescriptionDetails>
            </>
          )}
          {lead.consent_at && (
            <>
              <DescriptionTerm>{td.fields.consentAt}</DescriptionTerm>
              <DescriptionDetails>{dateFr(lead.consent_at)}</DescriptionDetails>
            </>
          )}
          {lead.notes && (
            <>
              <DescriptionTerm>{td.fields.notes}</DescriptionTerm>
              <DescriptionDetails>{lead.notes}</DescriptionDetails>
            </>
          )}
          {lead.updated_at && (
            <>
              <DescriptionTerm>{td.fields.updatedAt}</DescriptionTerm>
              <DescriptionDetails>{dateFr(lead.updated_at)}</DescriptionDetails>
            </>
          )}
        </DescriptionList>
      </DetailCard>

      {/* ── Budget ── */}
      <DetailCard title={td.cardBudget}>
        {lead.budget_min != null || lead.budget_max != null ? (
          <DescriptionList>
            {lead.budget_min != null && (
              <>
                <DescriptionTerm>{td.budgetMin}</DescriptionTerm>
                <DescriptionDetails className="font-semibold tabular-nums">
                  {eur(lead.budget_min)}
                </DescriptionDetails>
              </>
            )}
            {lead.budget_max != null && (
              <>
                <DescriptionTerm>{td.budgetMax}</DescriptionTerm>
                <DescriptionDetails className="font-semibold tabular-nums">
                  {eur(lead.budget_max)}
                </DescriptionDetails>
              </>
            )}
          </DescriptionList>
        ) : (
          <Text>{td.emptyBudget}</Text>
        )}
      </DetailCard>

      {/* ── Critères de recherche ── */}
      <DetailCard title={td.cardCriteres}>
        {criteres.length > 0 ? (
          <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
            {criteres.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  {c.nom && (
                    <span className="text-sm font-medium text-zinc-950 dark:text-white">{c.nom}</span>
                  )}
                  <dl className="mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
                    {c.type_bien && c.type_bien.length > 0 && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.typeBien}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">{c.type_bien.join(", ")}</dd>
                      </>
                    )}
                    {(c.budget_min != null || c.budget_max != null) && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.budget}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">
                          {c.budget_min != null ? eur(c.budget_min) : "—"}
                          {c.budget_min != null && c.budget_max != null ? " – " : ""}
                          {c.budget_max != null ? eur(c.budget_max) : ""}
                        </dd>
                      </>
                    )}
                    {(c.surface_min != null || c.surface_max != null) && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.surface}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">
                          {c.surface_min != null && c.surface_max != null
                            ? td.criteres.surfaceRange(c.surface_min, c.surface_max)
                            : c.surface_min != null
                            ? `≥ ${c.surface_min} m²`
                            : `≤ ${c.surface_max} m²`}
                        </dd>
                      </>
                    )}
                    {(c.pieces_min != null || c.pieces_max != null) && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.pieces}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">
                          {c.pieces_min != null && c.pieces_max != null
                            ? td.criteres.piecesRange(c.pieces_min, c.pieces_max)
                            : c.pieces_min != null
                            ? `≥ ${c.pieces_min} p.`
                            : `≤ ${c.pieces_max} p.`}
                        </dd>
                      </>
                    )}
                    {c.zones != null && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.zones}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">{formatZones(c.zones)}</dd>
                      </>
                    )}
                    {c.dpe_max && (
                      <>
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{td.criteres.dpeMax}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">{c.dpe_max}</dd>
                      </>
                    )}
                  </dl>
                  {/* Équipements souhaités */}
                  {(c.terrasse || c.parking || c.ascenseur || c.jardin || c.piscine) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.terrasse && <Badge color="zinc">{td.criteres.terrasse}</Badge>}
                      {c.parking && <Badge color="zinc">{td.criteres.parking}</Badge>}
                      {c.ascenseur && <Badge color="zinc">{td.criteres.ascenseur}</Badge>}
                      {c.jardin && <Badge color="zinc">{td.criteres.jardin}</Badge>}
                      {c.piscine && <Badge color="zinc">{td.criteres.piscine}</Badge>}
                    </div>
                  )}
                </div>
                {c.actif != null && (
                  <Badge color={c.actif ? "lime" : "zinc"}>
                    {c.actif ? td.criteres.actif : "Inactif"}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Text>{td.emptyCriteres}</Text>
        )}
      </DetailCard>

      {/* ── Visites liées ── */}
      <DetailCard title={td.cardVisites}>
        {visits.length > 0 ? (
          <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-zinc-950 dark:text-white">{dateTimeFr(v.scheduled_at)}</span>
                {v.properties?.title && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {v.properties.title}
                    {v.properties.city ? ` — ${v.properties.city}` : ""}
                  </span>
                )}
                <Badge color="zinc">{tVisits.statusLabels[v.status] ?? v.status}</Badge>
                {v.duration_min != null && v.duration_min > 0 && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{v.duration_min} min</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Text>{td.emptyVisites}</Text>
        )}
      </DetailCard>

      {/* ── Bien lié ── */}
      <DetailCard title={td.cardBienLie}>
        {linkedProperty ? (
          <>
            <DescriptionList>
              {linkedProperty.title && (
                <>
                  <DescriptionTerm>{UI.leads.detail.fields.title}</DescriptionTerm>
                  <DescriptionDetails>{linkedProperty.title}</DescriptionDetails>
                </>
              )}
              {linkedProperty.city && (
                <>
                  <DescriptionTerm>{td.bienLie.city}</DescriptionTerm>
                  <DescriptionDetails>{linkedProperty.city}</DescriptionDetails>
                </>
              )}
              {linkedProperty.property_type && (
                <>
                  <DescriptionTerm>{td.bienLie.type}</DescriptionTerm>
                  <DescriptionDetails>
                    {UI.properties.typeLabels[linkedProperty.property_type] ??
                      linkedProperty.property_type}
                  </DescriptionDetails>
                </>
              )}
              {linkedProperty.asking_price != null && (
                <>
                  <DescriptionTerm>{td.bienLie.price}</DescriptionTerm>
                  <DescriptionDetails className="font-semibold tabular-nums">
                    {eur(linkedProperty.asking_price)}
                  </DescriptionDetails>
                </>
              )}
            </DescriptionList>
            <div className="mt-4 border-t border-zinc-950/10 pt-3 dark:border-white/10">
              <Link
                href={`/properties/${linkedProperty.id}`}
                className="text-sm font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
              >
                {td.bienLie.seeProperty}
              </Link>
            </div>
          </>
        ) : (
          <Text>{td.emptyBienLie}</Text>
        )}
      </DetailCard>

      {/* ── Enrichissement ── */}
      {(() => {
        const canEnrich = isEnrichable(lead.type_personne) && !!lead.email;
        if (canEnrich) {
          return (
            <DetailCard title={td.enrich.cardTitle}>
              <Text>{td.enrich.intro}</Text>
              <LeadEnrichButton leadId={lead.id} hasData={lead.enriched_data != null} />
              {lead.enriched_data != null && (
                <>
                  {lead.enriched_at && (
                    <Text className="mt-3">
                      {td.fields.enrichedAt} {dateFr(lead.enriched_at)}
                      {lead.enriched_source ? ` · ${lead.enriched_source}` : ""}
                    </Text>
                  )}
                  <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
                    {Object.entries(lead.enriched_data).map(([key, val]) => (
                      <span key={key} className="contents">
                        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</dt>
                        <dd className="text-sm text-zinc-950 dark:text-zinc-200">
                          {typeof val === "object" && val !== null
                            ? JSON.stringify(val)
                            : String(val ?? "—")}
                        </dd>
                      </span>
                    ))}
                  </dl>
                </>
              )}
            </DetailCard>
          );
        }
        if (lead.enriched_data != null) {
          return (
            <DetailCard title={td.cardEnrichissement}>
              {lead.enriched_at && (
                <Text>
                  {td.fields.enrichedAt} {dateFr(lead.enriched_at)}
                  {lead.enriched_source ? ` · ${lead.enriched_source}` : ""}
                </Text>
              )}
              <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
                {Object.entries(lead.enriched_data).map(([key, val]) => (
                  <span key={key} className="contents">
                    <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</dt>
                    <dd className="text-sm text-zinc-950 dark:text-zinc-200">
                      {typeof val === "object" && val !== null
                        ? JSON.stringify(val)
                        : String(val ?? "—")}
                    </dd>
                  </span>
                ))}
              </dl>
            </DetailCard>
          );
        }
        return null;
      })()}
    </div>
  );
}
