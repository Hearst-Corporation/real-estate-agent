import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageStack, Card, Badge } from "@/components/cockpit/primitives";
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
  const metaSub = [
    t.kindLabels[mandate.kind] ?? mandate.kind,
    property?.city,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageStack>
      <PageHeader
        kicker={td.kicker + (mandate.reference ? ` · ${mandate.reference}` : "")}
        title={pageTitle}
        action={
          <div className="crm-detail-header-actions">
            <Link href="/mandates" className="ct-btn ct-btn-secondary">
              {td.backLink}
            </Link>
            <Badge>{t.statusLabels[mandate.status] ?? mandate.status}</Badge>
          </div>
        }
        kpis={[
          {
            label: t.table.price,
            value: eur(mandate.asking_price),
          },
          {
            label: t.table.commission,
            value:
              mandate.commission_pct != null
                ? `${mandate.commission_pct}${t.commissionUnit}`
                : "—",
          },
          {
            label: t.table.expires,
            value: dateFr(mandate.expires_at),
          },
        ]}
      />
      {metaSub && (
        <p className="ct-sub crm-header-tighten">
          {metaSub}
        </p>
      )}

      {/* ── Détail du mandat ────────────────────────────────────────────── */}
      <Card title={td.cardMandat}>
        <dl className="crm-detail-dl">
          <dt>{td.fields.kind}</dt>
          <dd>{t.kindLabels[mandate.kind] ?? mandate.kind}</dd>

          {mandate.reference && (
            <>
              <dt>{td.fields.reference}</dt>
              <dd>{mandate.reference}</dd>
            </>
          )}

          {mandate.asking_price != null && (
            <>
              <dt>{td.fields.askingPrice}</dt>
              <dd>{eur(mandate.asking_price)}</dd>
            </>
          )}

          {mandate.commission_pct != null && (
            <>
              <dt>{td.fields.commissionPct}</dt>
              <dd>{mandate.commission_pct}{t.commissionUnit}</dd>
            </>
          )}

          {commissionAmount != null && (
            <>
              <dt>{td.fields.commissionAmount}</dt>
              <dd>{eur(commissionAmount)}</dd>
            </>
          )}

          {mandate.signed_at && (
            <>
              <dt>{td.fields.signedAt}</dt>
              <dd>{dateFr(mandate.signed_at)}</dd>
            </>
          )}

          {mandate.expires_at && (
            <>
              <dt>{td.fields.expiresAt}</dt>
              <dd>
                {dateFr(mandate.expires_at)}
                {isExpiringSoon && daysLeft !== null && (
                  <span className="ct-badge crm-badge-spaced">
                    {td.expiringWarning} — {td.fields.daysLeft(daysLeft)}
                  </span>
                )}
                {isExpired && (
                  <span className="ct-badge crm-badge-spaced">
                    {td.fields.daysExpired}
                  </span>
                )}
              </dd>
            </>
          )}

          {mandate.updated_at && (
            <>
              <dt>{td.fields.updatedAt}</dt>
              <dd>{dateFr(mandate.updated_at)}</dd>
            </>
          )}
        </dl>

        {mandate.notes && (
          <div className="crm-notes-block">
            <p className="crm-notes-label">
              {td.fields.notes}
            </p>
            <p className="crm-notes-body">
              {mandate.notes}
            </p>
          </div>
        )}
      </Card>

      {/* ── Bien lié ────────────────────────────────────────────────────── */}
      <Card title={td.cardBien}>
        {property ? (
          <div className="crm-detail-dl">
            <dl className="crm-detail-dl">
              {property.title && (
                <>
                  <dt>{td.fields.notes /* reuse label slot */}</dt>
                  <dd>
                    <Link
                      href={`/properties/${property.id}` as import("@/config/nav").AppRoute}
                      className="crm-link"
                    >
                      {td.wellLinked}
                    </Link>
                  </dd>
                </>
              )}
              {property.property_type && (
                <>
                  <dt>{td.wellType}</dt>
                  <dd>
                    {UI.properties.typeLabels[property.property_type] ??
                      property.property_type}
                  </dd>
                </>
              )}
              {property.city && (
                <>
                  <dt>{td.wellCity}</dt>
                  <dd>{property.city}</dd>
                </>
              )}
              {property.surface != null && (
                <>
                  <dt>{td.wellSurface}</dt>
                  <dd>{sqm(property.surface)}</dd>
                </>
              )}
              {property.asking_price != null && (
                <>
                  <dt>{td.wellPrice}</dt>
                  <dd>{eur(property.asking_price)}</dd>
                </>
              )}
              <dt>{td.wellStatus}</dt>
              <dd>
                <Badge>
                  {UI.properties.statusLabels[property.status] ?? property.status}
                </Badge>
              </dd>
            </dl>
            <div className="crm-card-footer">
              <Link
                href={`/properties/${property.id}` as import("@/config/nav").AppRoute}
                className="crm-link"
              >
                {td.wellLinked}
              </Link>
            </div>
          </div>
        ) : (
          <p className="ct-placeholder">{td.emptyWell}</p>
        )}
      </Card>

      {/* ── Visites du bien ─────────────────────────────────────────────── */}
      <Card title={td.cardVisites}>
        {visits.length > 0 ? (
          <ul className="crm-list">
            {visits.map((visit) => (
              <li key={visit.id} className="crm-list-row">
                <span className="crm-list-name">{dateTimeFr(visit.scheduled_at)}</span>
                {visit.leads?.full_name && (
                  <span className="crm-list-meta">{visit.leads.full_name}</span>
                )}
                <Badge>
                  {UI.visits.statusLabels[visit.status] ?? visit.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-placeholder">{td.emptyVisits}</p>
        )}
      </Card>
    </PageStack>
  );
}
