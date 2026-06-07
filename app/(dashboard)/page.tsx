import Link from "next/link";
import {
  Card,
  PageHeader,
  PageStack,
} from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { dateFr } from "@/lib/crm/format";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

const RECENT_PROPERTIES_LIMIT = 6;
const LEADS_CLOSED = ["gagne", "perdu"];
const TODAY_PREVIEW = 3;

type PropertyRow = {
  id: string;
  title: string | null;
  status: string;
  city: string | null;
  property_type: string | null;
  updated_at: string;
};

type LeadRow = {
  id: string;
  full_name: string | null;
  status: string;
  updated_at: string;
};

type VisitRow = {
  id: string;
  scheduled_at: string;
  properties: { title: string | null; city: string | null } | null;
};

type MandateRow = {
  id: string;
  reference: string | null;
  expires_at: string;
  properties: { title: string | null; city: string | null } | null;
};

type EstimationRow = {
  id: string;
  city: string | null;
  property_type: string | null;
  status: string;
  updated_at: string;
};

function TodayBlock({
  label,
  items,
  empty,
  href,
}: {
  label: string;
  items: { id: string; line1: string; line2?: string; href: string }[];
  empty: string;
  href: string;
}) {
  return (
    <div className="ct-today-block">
      <div className="ct-today-block-head">
        <span className="ct-today-block-label">{label}</span>
        <Link href={href} className="ct-today-block-all">
          {UI.dashboard.today.seeAll}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="ct-placeholder">{empty}</p>
      ) : (
        <ul className="ct-today-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="ct-today-item-link">
                <span className="ct-today-item-line1">{item.line1}</span>
                {item.line2 ? (
                  <span className="ct-subtext">{item.line2}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickActions({
  items,
}: {
  items: { href: string; label: string; accent?: boolean }[];
}) {
  return (
    <div className="ct-home-action-grid">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ct-seg-btn${item.accent ? " primary" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let properties: PropertyRow[] = [];
  let nbLeadsActifs = 0;
  let nbVisitesAVenir = 0;
  let nbMandatsActifs = 0;
  let nbProperties = 0;

  let leadsToFollow: LeadRow[] = [];
  let upcomingVisits: VisitRow[] = [];
  let expiringMandates: MandateRow[] = [];
  let inProgressEstimations: EstimationRow[] = [];

  if (claims && sb) {
    const uid = claims.sub;
    const tid = tenantOf(claims);
    const now = new Date().toISOString();
    const in48h = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const in30d = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 3600 * 1000
    ).toISOString();

    const [
      propertiesRes,
      propertiesTotalRes,
      leadsCountRes,
      visitsCountRes,
      mandatesCountRes,
      leadsFollowRes,
      upcomingVisitsRes,
      expiringMandatesRes,
      inProgressEstimationsRes,
    ] = await Promise.all([
      // Portefeuille récent
      sb
        .from("properties")
        .select("id, title, status, city, property_type, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: false })
        .limit(RECENT_PROPERTIES_LIMIT),

      // KPI : total biens
      sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid),

      // KPI : leads actifs
      sb
        .from("leads")
        .select("id, status", { count: "exact" })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("status", "in", `(${LEADS_CLOSED.join(",")})`),

      // KPI : visites à venir
      sb
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", now),

      // KPI : mandats actifs
      sb
        .from("mandates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "actif"),

      // À faire : leads à relancer (pas touchés depuis 7j)
      sb
        .from("leads")
        .select("id, full_name, status, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("status", "in", `(${LEADS_CLOSED.join(",")})`)
        .lt("updated_at", sevenDaysAgo)
        .order("updated_at", { ascending: true })
        .limit(TODAY_PREVIEW + 1),

      // À faire : visites dans 48h
      sb
        .from("visits")
        .select("id, scheduled_at, properties(title, city)")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", now)
        .lte("scheduled_at", in48h)
        .order("scheduled_at", { ascending: true })
        .limit(TODAY_PREVIEW + 1),

      // À faire : mandats expirant dans 30j
      sb
        .from("mandates")
        .select("id, reference, expires_at, properties(title, city)")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "actif")
        .gte("expires_at", now)
        .lte("expires_at", in30d)
        .order("expires_at", { ascending: true })
        .limit(TODAY_PREVIEW + 1),

      // À faire : estimations en cours
      sb
        .from("estimations")
        .select("id, city, property_type, status, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .in("status", ["draft", "interviewing", "recap", "valuating"])
        .order("updated_at", { ascending: false })
        .limit(TODAY_PREVIEW + 1),
    ]);

    properties = (propertiesRes.data ?? []) as PropertyRow[];
    nbProperties = propertiesTotalRes.count ?? 0;
    nbLeadsActifs = leadsCountRes.count ?? (leadsCountRes.data?.length ?? 0);
    nbVisitesAVenir = visitsCountRes.count ?? 0;
    nbMandatsActifs = mandatesCountRes.count ?? 0;

    leadsToFollow = ((leadsFollowRes.data ?? []) as LeadRow[]).slice(
      0,
      TODAY_PREVIEW
    );
    upcomingVisits = ((upcomingVisitsRes.data ?? []) as unknown as VisitRow[]).slice(
      0,
      TODAY_PREVIEW
    );
    expiringMandates = (
      (expiringMandatesRes.data ?? []) as unknown as MandateRow[]
    ).slice(0, TODAY_PREVIEW);
    inProgressEstimations = (
      (inProgressEstimationsRes.data ?? []) as EstimationRow[]
    ).slice(0, TODAY_PREVIEW);
  }

  const recentColumns: Column<PropertyRow>[] = [
    {
      key: "property",
      header: "Bien",
      render: (r) => (
        <Link href={`/properties/${r.id}`} className="crm-link">
          {r.title ?? r.city ?? "Bien sans titre"}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (r) => r.status,
    },
    { key: "type", header: "Type", render: (r) => r.property_type ?? "—" },
    { key: "city", header: "Ville", render: (r) => r.city ?? "—" },
    {
      key: "updated",
      header: "Maj",
      align: "right",
      render: (r) => dateFr(r.updated_at),
    },
  ];

  const t = UI.dashboard;

  const quickActionItems = [
    { href: "/estimations/new", label: t.actions.newEstimation, accent: true },
    { href: "/properties?new=1", label: t.actions.newProperty },
    { href: "/leads?new=1", label: t.actions.newClient },
    { href: "/visits?new=1", label: t.actions.newVisit },
    { href: "/prospection", label: t.actions.launchPros },
  ];

  const leadItems = leadsToFollow.map((l) => ({
    id: l.id,
    line1: l.full_name ?? "Lead sans nom",
    line2: `Statut : ${l.status} · ${dateFr(l.updated_at)}`,
    href: `/leads/${l.id}`,
  }));

  const visitItems = upcomingVisits.map((v) => {
    const prop = v.properties;
    return {
      id: v.id,
      line1: prop?.title ?? prop?.city ?? "Bien non renseigné",
      line2: dateFr(v.scheduled_at),
      href: `/visits/${v.id}`,
    };
  });

  const mandateItems = expiringMandates.map((m) => {
    const prop = m.properties;
    return {
      id: m.id,
      line1: prop?.title ?? m.reference ?? "Mandat",
      line2: `Expire le ${dateFr(m.expires_at)}`,
      href: `/mandates/${m.id}`,
    };
  });

  const estimationItems = inProgressEstimations.map((e) => ({
    id: e.id,
    line1: e.city ?? "Estimation",
    line2: `${e.property_type ?? "—"} · ${e.status} · ${dateFr(e.updated_at)}`,
    href: `/estimations/${e.id}`,
  }));

  return (
    <PageStack>
      <PageHeader
        title={t.title}
        meta={t.sub}
        action={
          <Link href="/properties/new" className="ct-seg-btn primary">
            {t.newCta}
          </Link>
        }
        kpis={[
          { label: t.kpis.properties, value: String(nbProperties) },
          { label: t.kpis.activeLeads, value: String(nbLeadsActifs) },
          { label: t.kpis.upcomingVisits, value: String(nbVisitesAVenir) },
          { label: t.kpis.activeMandates, value: String(nbMandatsActifs) },
        ]}
      />

      <Card title={t.today.title} titleAs="section">
        <div className="ct-today-grid">
          <TodayBlock
            label={t.today.leadsLabel}
            items={leadItems}
            empty={t.today.emptyLeads}
            href="/leads"
          />
          <TodayBlock
            label={t.today.visitsLabel}
            items={visitItems}
            empty={t.today.emptyVisits}
            href="/visits"
          />
          <TodayBlock
            label={t.today.mandatesLabel}
            items={mandateItems}
            empty={t.today.emptyMandates}
            href="/mandates"
          />
          <TodayBlock
            label={t.today.estimationsLabel}
            items={estimationItems}
            empty={t.today.emptyEstimations}
            href="/estimations"
          />
        </div>
      </Card>

      <Card title={t.actions.title} titleAs="section">
        <QuickActions items={quickActionItems} />
      </Card>

      <Card title={t.recentPortfolio} variant="dense" className="ct-card-fill">
        {properties.length === 0 ? (
          <>
            <p className="ct-placeholder">{t.propertiesEmpty}</p>
            <div className="ct-mb-sm" />
            <Link href="/properties" className="ct-seg-btn primary">
              {t.addProperty}
            </Link>
          </>
        ) : (
          <>
            <DataTable
              columns={recentColumns}
              rows={properties}
              emptyLabel={t.propertiesEmpty}
              getKey={(r) => r.id}
            />
            <Link href="/properties" className="ct-seg-btn">
              {t.seeAllProperties}
            </Link>
          </>
        )}
      </Card>
    </PageStack>
  );
}
