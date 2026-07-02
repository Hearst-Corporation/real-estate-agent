import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Sub, Card, Badge } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { eur, dateFr, dateTimeFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { isEnrichable } from "@/lib/crm/enrichable";
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
    <>
      {/* ── Header ── */}
      <PageHeader
        kicker={eyebrow}
        title={lead.full_name ?? td.fallbackName}
        action={
          <Link href="/leads" className="text-sm font-medium text-indigo-300 hover:text-indigo-200">
            {td.backLink}
          </Link>
        }
      />

      {/* Statut + date sous le header */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <Badge>{t.statusLabels[lead.status] ?? lead.status}</Badge>
        {lead.source && (
          <Sub>{lead.source}</Sub>
        )}
        {lead.created_at && (
          <span className="text-sm text-slate-400">
            {td.fields.createdAt} {dateFr(lead.created_at)}
          </span>
        )}
      </div>

      {/* ── Identité & contact ── */}
      <Card title={td.cardIdentite}>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
          {lead.email && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.email}</dt>
              <dd className="text-sm text-slate-200">
                <a href={`mailto:${lead.email}`} className="text-indigo-300 hover:text-indigo-200">
                  {lead.email}
                </a>
              </dd>
            </>
          )}
          {lead.phone && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.phone}</dt>
              <dd className="text-sm text-slate-200">
                <a href={`tel:${lead.phone}`} className="text-indigo-300 hover:text-indigo-200">
                  {lead.phone}
                </a>
              </dd>
            </>
          )}
          {lead.source && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.source}</dt>
              <dd className="text-sm text-slate-200">{lead.source}</dd>
            </>
          )}
          {lead.type_personne && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.typePersonne}</dt>
              <dd className="text-sm text-slate-200">
                {t.typePersonneLabels[lead.type_personne] ?? lead.type_personne}
              </dd>
            </>
          )}
          {lead.consent_at && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.consentAt}</dt>
              <dd className="text-sm text-slate-200">{dateFr(lead.consent_at)}</dd>
            </>
          )}
          {lead.notes && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.notes}</dt>
              <dd className="text-sm text-slate-200">{lead.notes}</dd>
            </>
          )}
          {lead.updated_at && (
            <>
              <dt className="text-xs font-medium text-slate-500">{td.fields.updatedAt}</dt>
              <dd className="text-sm text-slate-200">{dateFr(lead.updated_at)}</dd>
            </>
          )}
        </dl>
      </Card>

      {/* ── Budget ── */}
      <Card title={td.cardBudget}>
        {lead.budget_min != null || lead.budget_max != null ? (
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
            {lead.budget_min != null && (
              <>
                <dt className="text-xs font-medium text-slate-500">{td.budgetMin}</dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-100">{eur(lead.budget_min)}</dd>
              </>
            )}
            {lead.budget_max != null && (
              <>
                <dt className="text-xs font-medium text-slate-500">{td.budgetMax}</dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-100">{eur(lead.budget_max)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{td.emptyBudget}</p>
        )}
      </Card>

      {/* ── Critères de recherche ── */}
      <Card title={td.cardCriteres}>
        {criteres.length > 0 ? (
          <ul className="divide-y divide-white/5">
            {criteres.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  {c.nom && (
                    <span className="text-sm font-medium text-slate-100">{c.nom}</span>
                  )}
                  <dl className="mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
                    {c.type_bien && c.type_bien.length > 0 && (
                      <>
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.typeBien}</dt>
                        <dd className="text-sm text-slate-200">{c.type_bien.join(", ")}</dd>
                      </>
                    )}
                    {(c.budget_min != null || c.budget_max != null) && (
                      <>
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.budget}</dt>
                        <dd className="text-sm text-slate-200">
                          {c.budget_min != null ? eur(c.budget_min) : "—"}
                          {c.budget_min != null && c.budget_max != null ? " – " : ""}
                          {c.budget_max != null ? eur(c.budget_max) : ""}
                        </dd>
                      </>
                    )}
                    {(c.surface_min != null || c.surface_max != null) && (
                      <>
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.surface}</dt>
                        <dd className="text-sm text-slate-200">
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
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.pieces}</dt>
                        <dd className="text-sm text-slate-200">
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
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.zones}</dt>
                        <dd className="text-sm text-slate-200">{formatZones(c.zones)}</dd>
                      </>
                    )}
                    {c.dpe_max && (
                      <>
                        <dt className="text-xs font-medium text-slate-500">{td.criteres.dpeMax}</dt>
                        <dd className="text-sm text-slate-200">{c.dpe_max}</dd>
                      </>
                    )}
                  </dl>
                  {/* Équipements souhaités */}
                  {(c.terrasse || c.parking || c.ascenseur || c.jardin || c.piscine) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.terrasse && <Badge>{td.criteres.terrasse}</Badge>}
                      {c.parking && <Badge>{td.criteres.parking}</Badge>}
                      {c.ascenseur && <Badge>{td.criteres.ascenseur}</Badge>}
                      {c.jardin && <Badge>{td.criteres.jardin}</Badge>}
                      {c.piscine && <Badge>{td.criteres.piscine}</Badge>}
                    </div>
                  )}
                </div>
                {c.actif != null && (
                  <Badge>{c.actif ? td.criteres.actif : "Inactif"}</Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{td.emptyCriteres}</p>
        )}
      </Card>

      {/* ── Visites liées ── */}
      <Card title={td.cardVisites}>
        {visits.length > 0 ? (
          <ul className="divide-y divide-white/5">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-slate-100">{dateTimeFr(v.scheduled_at)}</span>
                {v.properties?.title && (
                  <span className="text-sm text-slate-400">
                    {v.properties.title}
                    {v.properties.city ? ` — ${v.properties.city}` : ""}
                  </span>
                )}
                <Badge>{tVisits.statusLabels[v.status] ?? v.status}</Badge>
                {v.duration_min != null && v.duration_min > 0 && (
                  <span className="text-sm text-slate-400">{v.duration_min} min</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{td.emptyVisites}</p>
        )}
      </Card>

      {/* ── Bien lié ── */}
      <Card title={td.cardBienLie}>
        {linkedProperty ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
              {linkedProperty.title && (
                <>
                  <dt className="text-xs font-medium text-slate-500">{UI.leads.detail.fields.title}</dt>
                  <dd className="text-sm text-slate-200">{linkedProperty.title}</dd>
                </>
              )}
              {linkedProperty.city && (
                <>
                  <dt className="text-xs font-medium text-slate-500">{td.bienLie.city}</dt>
                  <dd className="text-sm text-slate-200">{linkedProperty.city}</dd>
                </>
              )}
              {linkedProperty.property_type && (
                <>
                  <dt className="text-xs font-medium text-slate-500">{td.bienLie.type}</dt>
                  <dd className="text-sm text-slate-200">
                    {UI.properties.typeLabels[linkedProperty.property_type] ??
                      linkedProperty.property_type}
                  </dd>
                </>
              )}
              {linkedProperty.asking_price != null && (
                <>
                  <dt className="text-xs font-medium text-slate-500">{td.bienLie.price}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-slate-100">{eur(linkedProperty.asking_price)}</dd>
                </>
              )}
            </dl>
            <div className="mt-4 border-t border-white/10 pt-3">
              <Link
                href={`/properties/${linkedProperty.id}`}
                className="text-sm font-medium text-indigo-300 hover:text-indigo-200"
              >
                {td.bienLie.seeProperty}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{td.emptyBienLie}</p>
        )}
      </Card>

      {/* ── Enrichissement ── */}
      {(() => {
        const canEnrich = isEnrichable(lead.type_personne) && !!lead.email;
        if (canEnrich) {
          return (
            <Card title={td.enrich.cardTitle}>
              <p className="text-sm text-slate-400">{td.enrich.intro}</p>
              <LeadEnrichButton leadId={lead.id} hasData={lead.enriched_data != null} />
              {lead.enriched_data != null && (
                <>
                  {lead.enriched_at && (
                    <p className="text-sm text-slate-400">
                      {td.fields.enrichedAt} {dateFr(lead.enriched_at)}
                      {lead.enriched_source ? ` · ${lead.enriched_source}` : ""}
                    </p>
                  )}
                  <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
                    {Object.entries(lead.enriched_data).map(([key, val]) => (
                      <span key={key}>
                        <dt className="text-xs font-medium text-slate-500">{key}</dt>
                        <dd className="text-sm text-slate-200">
                          {typeof val === "object" && val !== null
                            ? JSON.stringify(val)
                            : String(val ?? "—")}
                        </dd>
                      </span>
                    ))}
                  </dl>
                </>
              )}
            </Card>
          );
        }
        if (lead.enriched_data != null) {
          return (
            <Card title={td.cardEnrichissement}>
              {lead.enriched_at && (
                <p className="text-sm text-slate-400">
                  {td.fields.enrichedAt} {dateFr(lead.enriched_at)}
                  {lead.enriched_source ? ` · ${lead.enriched_source}` : ""}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
                {Object.entries(lead.enriched_data).map(([key, val]) => (
                  <span key={key}>
                    <dt className="text-xs font-medium text-slate-500">{key}</dt>
                    <dd className="text-sm text-slate-200">
                      {typeof val === "object" && val !== null
                        ? JSON.stringify(val)
                        : String(val ?? "—")}
                    </dd>
                  </span>
                ))}
              </dl>
            </Card>
          );
        }
        return null;
      })()}
    </>
  );
}
