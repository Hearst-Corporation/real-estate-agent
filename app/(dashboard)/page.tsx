import { UI } from "@/lib/ui-strings";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { dateFr } from "@/lib/crm/format";
import { filterSeed } from "@/lib/crm/demo-filter";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { Text } from "@/components/ui/text";
import { Link } from "@/components/ui/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RECENT_PROPERTIES_LIMIT = 6;
const LEADS_CLOSED = ["gagne", "perdu"];
const TODAY_PREVIEW = 3;

const HOURS_48_MS = 48 * 3600 * 1000;
const DAYS_30_MS = 30 * 24 * 3600 * 1000;
const DAYS_7_MS = 7 * 24 * 3600 * 1000;

/** CTA principal unique — or plein, texte foncé (contraste AA sur l'accent). */
const PRIMARY_CTA =
  "group inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[var(--shadow-card)] transition-[background-color,box-shadow] duration-200 hover:bg-accent-400 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700";

// Fenêtres temporelles partagent le même instant (un seul Date.now()) pour éviter
// des fenêtres incohérentes si plusieurs appels se décalent de quelques ms.
function computeTimeWindows() {
  const nowMs = Date.now();
  return {
    now: new Date(nowMs).toISOString(),
    in48h: new Date(nowMs + HOURS_48_MS).toISOString(),
    in30d: new Date(nowMs + DAYS_30_MS).toISOString(),
    sevenDaysAgo: new Date(nowMs - DAYS_7_MS).toISOString(),
  };
}

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

type ListItem = { id: string; line1: string; line2?: string; href: string };

/** Liste actionnable d'un panneau (visites, mandats, estimations, leads). */
function TaskList({
  label,
  hint,
  items,
  empty,
  href,
}: {
  label: string;
  hint?: string;
  items: ListItem[];
  empty: string;
  href: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-950/8 pb-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {label}
          </span>
          {hint ? (
            <span className="hidden shrink-0 text-[11px] font-medium text-accent-600 @sm:inline">
              {hint}
            </span>
          ) : null}
        </span>
        <Link
          href={href}
          className="shrink-0 rounded-sm text-xs font-medium text-accent-700 transition-colors hover:text-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          {UI.dashboard.today.seeAll}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent-500/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900 transition-colors group-hover:text-accent-800">
                    {item.line1}
                  </span>
                  {item.line2 ? (
                    <span className="block truncate text-xs text-zinc-500">{item.line2}</span>
                  ) : null}
                </span>
                <Icon
                  name="chevron-right"
                  className="size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-accent-500"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ligne d'actions secondaires compactes (l'action principale vit dans le header). */
function ActionTiles({
  items,
}: {
  items: { href: string; label: string; icon: IconName }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex items-center gap-3 rounded-xl border border-accent-500/12 bg-white px-4 py-3 shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600 transition-colors group-hover:bg-accent-500/15">
            <Icon name={item.icon} className="size-5" />
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-zinc-800 transition-colors group-hover:text-accent-800">
            {item.label}
          </span>
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
    const { now, in48h, in30d, sevenDaysAgo } = computeTimeWindows();

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

    properties = filterSeed((propertiesRes.data ?? []) as PropertyRow[], (p) => [p.title, p.city]);
    nbProperties = propertiesTotalRes.count ?? 0;
    nbLeadsActifs = leadsCountRes.count ?? (leadsCountRes.data?.length ?? 0);
    nbVisitesAVenir = visitsCountRes.count ?? 0;
    nbMandatsActifs = mandatesCountRes.count ?? 0;

    leadsToFollow = filterSeed((leadsFollowRes.data ?? []) as LeadRow[], (l) => [l.full_name]).slice(
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

  const t = UI.dashboard;

  const secondaryActions: { href: string; label: string; icon: IconName }[] = [
    { href: "/properties?new=1", label: t.actions.newProperty, icon: "properties" },
    { href: "/leads?new=1", label: t.actions.newClient, icon: "leads" },
    { href: "/visits?new=1", label: t.actions.newVisit, icon: "visits" },
    { href: "/prospection", label: t.actions.launchPros, icon: "search" },
  ];

  // leads / visits / mandates n'ont pas de page détail [id] (édition via drawer
  // inline dans la liste) — on pointe vers la liste, pas vers une route 404.
  const leadItems: ListItem[] = leadsToFollow.map((l) => ({
    id: l.id,
    line1: l.full_name ?? "Lead sans nom",
    line2: `Statut : ${l.status} · ${dateFr(l.updated_at)}`,
    href: "/leads",
  }));

  const visitItems: ListItem[] = upcomingVisits.map((v) => {
    const prop = v.properties;
    return {
      id: v.id,
      line1: prop?.title ?? prop?.city ?? "Bien non renseigné",
      line2: dateFr(v.scheduled_at),
      href: "/visits",
    };
  });

  const mandateItems: ListItem[] = expiringMandates.map((m) => {
    const prop = m.properties;
    return {
      id: m.id,
      line1: prop?.title ?? m.reference ?? "Mandat",
      line2: `Expire le ${dateFr(m.expires_at)}`,
      href: "/mandates",
    };
  });

  const estimationItems: ListItem[] = inProgressEstimations.map((e) => ({
    id: e.id,
    line1: e.city ?? "Estimation",
    line2: `${e.property_type ?? "—"} · ${e.status} · ${dateFr(e.updated_at)}`,
    href: `/estimations/${e.id}`,
  }));

  const kpis = [
    { label: t.kpis.properties, value: String(nbProperties), icon: "properties" as IconName },
    { label: t.kpis.activeLeads, value: String(nbLeadsActifs), icon: "leads" as IconName },
    { label: t.kpis.upcomingVisits, value: String(nbVisitesAVenir), icon: "visits" as IconName },
    { label: t.kpis.activeMandates, value: String(nbMandatsActifs), icon: "mandates" as IconName },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
      {/* Header — eyebrow + titre court + action principale UNIQUE (or) */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-600">
            <span aria-hidden className="h-px w-6 bg-accent-500/70" />
            {t.eyebrow}
          </p>
          <h1 className="mt-2 font-titre text-3xl font-semibold tracking-tight text-zinc-900">
            {t.title}
          </h1>
        </div>
        <Link href="/estimations/new" className={PRIMARY_CTA}>
          <Icon name="estimate" className="size-5" />
          {t.actions.newEstimation}
        </Link>
      </header>

      {/* KPI — bandeau léger à filets or (pas 4 cartes encagées) */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-accent-500/12 bg-accent-500/15 shadow-[var(--shadow-card)] @xl:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className="flex items-center gap-3 bg-white px-5 py-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600"
            >
              <Icon name={item.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              <dd className="text-2xl font-semibold leading-none tracking-tight text-accent-700 tabular-nums">
                {item.value}
              </dd>
              <dt className="mt-1.5 truncate text-xs font-medium text-zinc-500">{item.label}</dt>
            </div>
          </div>
        ))}
      </dl>

      {/* (a) À FAIRE MAINTENANT — bloc dominant : hero or, urgences opérationnelles */}
      <section className="surface border-t-2 border-t-accent-500/50 bg-gradient-to-br from-accent-500/10 via-white to-white p-6 shadow-[var(--shadow-hero)] @2xl:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700"
          >
            <Icon name="agenda" className="size-5" />
          </span>
          <h2 className="font-titre text-xl font-semibold text-zinc-900">{t.today.title}</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 @2xl:grid-cols-2">
          <TaskList
            label={t.today.visitsLabel}
            items={visitItems}
            empty={t.today.emptyVisits}
            href="/visits"
          />
          <TaskList
            label={t.today.mandatesLabel}
            items={mandateItems}
            empty={t.today.emptyMandates}
            href="/mandates"
          />
        </div>
      </section>

      {/* (b) OPPORTUNITÉS — reframe des données chaudes réelles (pas de fabrication) */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600"
          >
            <Icon name="estimate" className="size-4" />
          </span>
          <h2 className="font-titre text-xl font-semibold text-zinc-900">{t.opportunities.title}</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 rounded-2xl border border-accent-500/10 bg-white/60 p-6 @2xl:grid-cols-2">
          <TaskList
            label={t.opportunities.estimationsLabel}
            hint={t.opportunities.estimationsHint}
            items={estimationItems}
            empty={t.opportunities.emptyEstimations}
            href="/estimations"
          />
          <TaskList
            label={t.opportunities.leadsLabel}
            hint={t.opportunities.leadsHint}
            items={leadItems}
            empty={t.opportunities.emptyLeads}
            href="/leads"
          />
        </div>
      </section>

      {/* (c) ACTIONS RAPIDES — secondaires (l'action principale est dans le header) */}
      <section>
        <h2 className="mb-4 font-titre text-xl font-semibold text-zinc-900">{t.actions.title}</h2>
        <ActionTiles items={secondaryActions} />
      </section>

      {/* (d) ACTIVITÉ RÉCENTE — portefeuille récent */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-titre text-xl font-semibold text-zinc-900">{t.recentPortfolio}</h2>
          {properties.length > 0 ? (
            <Link
              href="/properties"
              className="shrink-0 rounded-sm text-sm font-medium text-accent-700 transition-colors hover:text-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            >
              {t.seeAllProperties}
            </Link>
          ) : null}
        </div>

        {properties.length === 0 ? (
          <div className="surface flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600"
            >
              <Icon name="properties" className="size-6" />
            </span>
            <Text>{t.propertiesEmpty}</Text>
            <Link href="/properties?new=1" className={PRIMARY_CTA}>
              <Icon name="plus" className="size-5" />
              {t.addProperty}
            </Link>
          </div>
        ) : (
          <div className="surface overflow-hidden px-5 py-2">
            <Table dense grid>
              <TableHead>
                <TableRow>
                  <TableHeader>Bien</TableHeader>
                  <TableHeader>Statut</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Ville</TableHeader>
                  <TableHeader className="text-right">Maj</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {properties.map((r) => (
                  <TableRow key={r.id} href={`/properties/${r.id}`}>
                    <TableCell className="font-medium text-zinc-950">
                      {r.title ?? r.city ?? "Bien sans titre"}
                    </TableCell>
                    <TableCell className="text-zinc-500">{r.status}</TableCell>
                    <TableCell className="text-zinc-500">{r.property_type ?? "—"}</TableCell>
                    <TableCell className="text-zinc-500">{r.city ?? "—"}</TableCell>
                    <TableCell className="text-right text-zinc-500">{dateFr(r.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
