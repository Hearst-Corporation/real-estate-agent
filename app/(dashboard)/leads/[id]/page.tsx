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

// ─── UI primitives (blocs Tailwind Plus, thème sombre) ──────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200">
      {children}
    </span>
  );
}

/** Card conteneur — data-display__description-lists/02-left-aligned-in-card (dark). */
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="px-6 py-5">
        <h3 className="text-base/7 font-semibold text-white">{title}</h3>
      </div>
      <div className="border-t border-white/10 px-6 py-5">{children}</div>
    </section>
  );
}

/** Ligne dt/dd — description-list en grille (dark). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm/6 text-slate-200 sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
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
      {/* Header — headings__page-headings/03-with-meta-and-actions (dark) */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl">
            {lead.full_name ?? td.fallbackName}
          </h1>
          <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6">
            <div className="mt-2 flex items-center text-sm text-slate-400">
              <Badge>{t.statusLabels[lead.status] ?? lead.status}</Badge>
            </div>
            {lead.source && (
              <div className="mt-2 flex items-center text-sm text-slate-400">
                <TagIcon aria-hidden="true" className="mr-1.5 size-5 shrink-0 text-slate-500" />
                {lead.source}
              </div>
            )}
            {lead.created_at && (
              <div className="mt-2 flex items-center text-sm text-slate-400">
                <CalendarIcon aria-hidden="true" className="mr-1.5 size-5 shrink-0 text-slate-500" />
                {td.fields.createdAt} {dateFr(lead.created_at)}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex shrink-0 lg:mt-0 lg:ml-4">
          <Link
            href="/leads"
            className="inline-flex items-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeftIcon aria-hidden="true" className="mr-1.5 -ml-0.5 size-5 text-slate-400" />
            {td.backLink}
          </Link>
        </div>
      </div>

      {/* ── Identité & contact ── */}
      <DetailCard title={td.cardIdentite}>
        <dl className="divide-y divide-white/5">
          {lead.email && (
            <Row label={td.fields.email}>
              <a href={`mailto:${lead.email}`} className="text-indigo-300 hover:text-indigo-200">
                {lead.email}
              </a>
            </Row>
          )}
          {lead.phone && (
            <Row label={td.fields.phone}>
              <a href={`tel:${lead.phone}`} className="text-indigo-300 hover:text-indigo-200">
                {lead.phone}
              </a>
            </Row>
          )}
          {lead.source && <Row label={td.fields.source}>{lead.source}</Row>}
          {lead.type_personne && (
            <Row label={td.fields.typePersonne}>
              {t.typePersonneLabels[lead.type_personne] ?? lead.type_personne}
            </Row>
          )}
          {lead.consent_at && <Row label={td.fields.consentAt}>{dateFr(lead.consent_at)}</Row>}
          {lead.notes && <Row label={td.fields.notes}>{lead.notes}</Row>}
          {lead.updated_at && <Row label={td.fields.updatedAt}>{dateFr(lead.updated_at)}</Row>}
        </dl>
      </DetailCard>

      {/* ── Budget ── */}
      <DetailCard title={td.cardBudget}>
        {lead.budget_min != null || lead.budget_max != null ? (
          <dl className="divide-y divide-white/5">
            {lead.budget_min != null && (
              <Row label={td.budgetMin}>
                <span className="font-semibold tabular-nums text-slate-100">{eur(lead.budget_min)}</span>
              </Row>
            )}
            {lead.budget_max != null && (
              <Row label={td.budgetMax}>
                <span className="font-semibold tabular-nums text-slate-100">{eur(lead.budget_max)}</span>
              </Row>
            )}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{td.emptyBudget}</p>
        )}
      </DetailCard>

      {/* ── Critères de recherche ── */}
      <DetailCard title={td.cardCriteres}>
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
      </DetailCard>

      {/* ── Visites liées ── */}
      <DetailCard title={td.cardVisites}>
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
      </DetailCard>

      {/* ── Bien lié ── */}
      <DetailCard title={td.cardBienLie}>
        {linkedProperty ? (
          <>
            <dl className="divide-y divide-white/5">
              {linkedProperty.title && (
                <Row label={UI.leads.detail.fields.title}>{linkedProperty.title}</Row>
              )}
              {linkedProperty.city && <Row label={td.bienLie.city}>{linkedProperty.city}</Row>}
              {linkedProperty.property_type && (
                <Row label={td.bienLie.type}>
                  {UI.properties.typeLabels[linkedProperty.property_type] ??
                    linkedProperty.property_type}
                </Row>
              )}
              {linkedProperty.asking_price != null && (
                <Row label={td.bienLie.price}>
                  <span className="font-semibold tabular-nums text-slate-100">{eur(linkedProperty.asking_price)}</span>
                </Row>
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
      </DetailCard>

      {/* ── Enrichissement ── */}
      {(() => {
        const canEnrich = isEnrichable(lead.type_personne) && !!lead.email;
        if (canEnrich) {
          return (
            <DetailCard title={td.enrich.cardTitle}>
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
            </DetailCard>
          );
        }
        if (lead.enriched_data != null) {
          return (
            <DetailCard title={td.cardEnrichissement}>
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
            </DetailCard>
          );
        }
        return null;
      })()}
    </div>
  );
}
