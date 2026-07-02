import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { eur, sqm, dateFr, dateTimeFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

type MandateRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  status: string;
  kind: string;
  property_id: string | null;
  reference: string | null;
  asking_price: number | null;
  commission_pct: number | null;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyRow = {
  id: string;
  title: string | null;
  city: string | null;
  property_type: string | null;
  surface: number | null;
  asking_price: number | null;
  status: string;
};

type VisitRow = {
  id: string;
  scheduled_at: string;
  status: string;
  leads: { full_name: string } | null;
};

/** Nombre de jours entre aujourd'hui et une date future. Négatif si passée. */
function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const MS_PER_DAY = 86_400_000;
  return Math.round((new Date(d).getTime() - Date.now()) / MS_PER_DAY);
}

/** Ligne de description-list — TW+ data-display/description-lists (thème sombre). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 first:pt-0 last:pb-0 @sm:grid-cols-3 @sm:gap-4">
      <dt className="text-sm font-medium text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-200 @sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Card conteneur — TW+ layout__cards/03-card-with-header (thème sombre). */
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default async function MandateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = UI.mandates;
  const td = UI.mandates.detail;

  const claims = await getSession();
  if (!claims) notFound();

  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // ── Fetch principal ────────────────────────────────────────────────────────
  const { data: mandateData } = await sb
    .from("mandates")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const mandate = mandateData as MandateRow | null;
  if (!mandate) notFound();

  // ── Fetches liés (Promise.all) ─────────────────────────────────────────────
  const [{ data: propertyData }, { data: visitsData }] = await Promise.all([
    mandate.property_id
      ? sb
          .from("properties")
          .select("id, title, city, property_type, surface, asking_price, status")
          .eq("id", mandate.property_id)
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .single()
      : Promise.resolve({ data: null }),
    mandate.property_id
      ? sb
          .from("visits")
          .select("id, scheduled_at, status, leads(full_name)")
          .eq("property_id", mandate.property_id)
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .order("scheduled_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const property = propertyData as PropertyRow | null;
  const visits = (visitsData ?? []) as VisitRow[];

  // ── Calculs ────────────────────────────────────────────────────────────────
  const commissionAmount =
    mandate.asking_price != null && mandate.commission_pct != null
      ? Math.round((mandate.asking_price * mandate.commission_pct) / 100)
      : null;

  const daysLeft = daysUntil(mandate.expires_at);
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30; // strings-lint-allow
  const isExpired = daysLeft !== null && daysLeft < 0;

  // ── Titre affiché ──────────────────────────────────────────────────────────
  const pageTitle = property?.title ?? mandate.reference ?? td.fallbackTitle;
  const metaSub = [t.kindLabels[mandate.kind] ?? mandate.kind, property?.city]
    .filter(Boolean)
    .join(" · ");

  const headerKpis = [
    { label: t.table.price, value: eur(mandate.asking_price) },
    {
      label: t.table.commission,
      value:
        mandate.commission_pct != null
          ? `${mandate.commission_pct}${t.commissionUnit}`
          : "—",
    },
    { label: t.table.expires, value: dateFr(mandate.expires_at) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Page heading — TW+ headings/03-with-meta-and-actions (thème sombre) */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="@lg:flex @lg:items-center @lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {td.kicker + (mandate.reference ? ` · ${mandate.reference}` : "")}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white @sm:truncate @sm:text-3xl">
              {pageTitle}
            </h1>
            {metaSub && <p className="mt-1 text-sm text-slate-400">{metaSub}</p>}
          </div>
          <div className="mt-4 flex items-center gap-3 @lg:mt-0 @lg:ml-4">
            <Link
              href="/mandates"
              className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
            >
              {td.backLink}
            </Link>
            <Badge>{t.statusLabels[mandate.status] ?? mandate.status}</Badge>
          </div>
        </div>

        {/* KPI stats — TW+ data-display/stats (thème sombre) */}
        <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
          {headerKpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {kpi.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Détail du mandat — description-list ──────────────────────────── */}
      <DetailCard title={td.cardMandat}>
        <dl className="divide-y divide-white/5">
          <Row label={td.fields.kind}>{t.kindLabels[mandate.kind] ?? mandate.kind}</Row>

          {mandate.reference && <Row label={td.fields.reference}>{mandate.reference}</Row>}

          {mandate.asking_price != null && (
            <Row label={td.fields.askingPrice}>{eur(mandate.asking_price)}</Row>
          )}

          {mandate.commission_pct != null && (
            <Row label={td.fields.commissionPct}>
              {mandate.commission_pct}
              {t.commissionUnit}
            </Row>
          )}

          {commissionAmount != null && (
            <Row label={td.fields.commissionAmount}>{eur(commissionAmount)}</Row>
          )}

          {mandate.signed_at && <Row label={td.fields.signedAt}>{dateFr(mandate.signed_at)}</Row>}

          {mandate.expires_at && (
            <Row label={td.fields.expiresAt}>
              <span className="flex flex-wrap items-center gap-2">
                {dateFr(mandate.expires_at)}
                {isExpiringSoon && daysLeft !== null && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                    {td.expiringWarning} — {td.fields.daysLeft(daysLeft)}
                  </span>
                )}
                {isExpired && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-300">
                    {td.fields.daysExpired}
                  </span>
                )}
              </span>
            </Row>
          )}

          {mandate.updated_at && <Row label={td.fields.updatedAt}>{dateFr(mandate.updated_at)}</Row>}
        </dl>

        {mandate.notes && (
          <div className="mt-4 border-t border-white/5 pt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {td.fields.notes}
            </p>
            <p className="mt-2 text-sm whitespace-pre-wrap text-slate-300">{mandate.notes}</p>
          </div>
        )}
      </DetailCard>

      {/* ── Bien lié — description-list + empty-state ────────────────────── */}
      <DetailCard title={td.cardBien}>
        {property ? (
          <div>
            <dl className="divide-y divide-white/5">
              {property.property_type && (
                <Row label={td.wellType}>
                  {UI.properties.typeLabels[property.property_type] ?? property.property_type}
                </Row>
              )}
              {property.city && <Row label={td.wellCity}>{property.city}</Row>}
              {property.surface != null && <Row label={td.wellSurface}>{sqm(property.surface)}</Row>}
              {property.asking_price != null && (
                <Row label={td.wellPrice}>{eur(property.asking_price)}</Row>
              )}
              <Row label={td.wellStatus}>
                <Badge>{UI.properties.statusLabels[property.status] ?? property.status}</Badge>
              </Row>
            </dl>
            <div className="mt-4 border-t border-white/5 pt-4">
              <Link
                href={`/properties/${property.id}` as import("@/config/nav").AppRoute}
                className="text-sm font-medium text-indigo-300 hover:text-indigo-200"
              >
                {td.wellLinked}
              </Link>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">{td.emptyWell}</p>
        )}
      </DetailCard>

      {/* ── Visites du bien — TW+ lists__stacked-lists (thème sombre) ────── */}
      <DetailCard title={td.cardVisites}>
        {visits.length > 0 ? (
          <ul role="list" className="divide-y divide-white/5">
            {visits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-100">
                    {dateTimeFr(visit.scheduled_at)}
                  </span>
                  {visit.leads?.full_name && (
                    <span className="text-sm text-slate-400">{visit.leads.full_name}</span>
                  )}
                </div>
                <Badge>{UI.visits.statusLabels[visit.status] ?? visit.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">{td.emptyVisits}</p>
        )}
      </DetailCard>
    </div>
  );
}
