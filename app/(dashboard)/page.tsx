import { PlusIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { dateFr } from "@/lib/crm/format";
import { filterSeed } from "@/lib/crm/demo-filter";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text, TextLink } from "@/components/ui/text";
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
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <TextLink href={href} className="text-xs">
          {UI.dashboard.today.seeAll}
        </TextLink>
      </div>
      {items.length === 0 ? (
        <Text className="py-4 text-center">{empty}</Text>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-950/5 dark:divide-white/5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex flex-col gap-0.5 py-2 text-sm text-zinc-950 transition-colors hover:text-zinc-500 dark:text-white dark:hover:text-zinc-400"
              >
                <span className="font-medium">{item.line1}</span>
                {item.line2 ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.line2}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bloc d'actions cockpit : une action principale forte + 4 secondaires compactes. */
function QuickActions({
  primary,
  secondary,
}: {
  primary: { href: string; label: string; desc: string; icon: IconName };
  secondary: { href: string; label: string; icon: IconName }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
      <Link
        href={primary.href}
        className="flex items-center gap-4 rounded-xl border border-accent-500/30 bg-accent-500/10 p-4 transition-colors hover:bg-accent-500/15"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-500/20 text-accent-500 dark:text-accent-300">
          <Icon name={primary.icon} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-zinc-950 dark:text-white">{primary.label}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{primary.desc}</span>
        </span>
      </Link>
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        {secondary.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-zinc-950/10 p-3 text-center transition-colors hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-zinc-950/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
              <Icon name={item.icon} />
            </span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{item.label}</span>
          </Link>
        ))}
      </div>
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

  const primaryAction = {
    href: "/estimations/new",
    label: t.actions.newEstimation,
    desc: t.actions.newEstimationDesc,
    icon: "estimate" as IconName,
  };
  const secondaryActions: { href: string; label: string; icon: IconName }[] = [
    { href: "/properties?new=1", label: t.actions.newProperty, icon: "properties" },
    { href: "/leads?new=1", label: t.actions.newClient, icon: "leads" },
    { href: "/visits?new=1", label: t.actions.newVisit, icon: "visits" },
    { href: "/prospection", label: t.actions.launchPros, icon: "search" },
  ];

  // leads / visits / mandates n'ont pas de page détail [id] (édition via drawer
  // inline dans la liste) — on pointe vers la liste, pas vers une route 404.
  const leadItems = leadsToFollow.map((l) => ({
    id: l.id,
    line1: l.full_name ?? "Lead sans nom",
    line2: `Statut : ${l.status} · ${dateFr(l.updated_at)}`,
    href: "/leads",
  }));

  const visitItems = upcomingVisits.map((v) => {
    const prop = v.properties;
    return {
      id: v.id,
      line1: prop?.title ?? prop?.city ?? "Bien non renseigné",
      line2: dateFr(v.scheduled_at),
      href: "/visits",
    };
  });

  const mandateItems = expiringMandates.map((m) => {
    const prop = m.properties;
    return {
      id: m.id,
      line1: prop?.title ?? m.reference ?? "Mandat",
      line2: `Expire le ${dateFr(m.expires_at)}`,
      href: "/mandates",
    };
  });

  const estimationItems = inProgressEstimations.map((e) => ({
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
    <div className="flex flex-col gap-8">
      {/* Header de page — structure headings__page-headings/01-with-actions montée en primitives */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-300">
            {t.eyebrow}
          </p>
          <Heading className="mt-1 sm:truncate">{t.title}</Heading>
          <Text className="mt-1">{t.sub}</Text>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <Button color="indigo" href="/properties/new">
            {t.newCta}
          </Button>
        </div>
      </div>

      {/* KPI tiles — grille CSS + primitives (structure data-display__stats/03-simple-in-cards) */}
      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="overflow-hidden rounded-2xl border border-zinc-950/10 px-5 py-6 dark:border-white/10"
          >
            <div className="flex items-center justify-between">
              <dt className="truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {item.label}
              </dt>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-500 dark:text-accent-300">
                <Icon name={item.icon} />
              </span>
            </div>
            <dd className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Actions — card conteneur (layout__cards) + grille d'actions cockpit */}
      <section className="rounded-2xl border border-zinc-950/10 p-5 dark:border-white/10">
        <Subheading>{t.actions.title}</Subheading>
        <div className="mt-4">
          <QuickActions primary={primaryAction} secondary={secondaryActions} />
        </div>
      </section>

      {/* À faire aujourd'hui — grille de listes empilées (lists__stacked-lists) */}
      <section className="rounded-2xl border border-zinc-950/10 p-5 dark:border-white/10">
        <Subheading>{t.today.title}</Subheading>
        <div className="mt-4 grid grid-cols-1 gap-4 @2xl:grid-cols-2 @6xl:grid-cols-4">
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
      </section>

      {/* Portefeuille récent — Table Catalyst + empty-state */}
      <section className="rounded-2xl border border-zinc-950/10 p-5 dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <Subheading>{t.recentPortfolio}</Subheading>
          {properties.length > 0 ? (
            <TextLink href="/properties" className="text-sm">
              {t.seeAllProperties}
            </TextLink>
          ) : null}
        </div>

        {properties.length === 0 ? (
          <div className="py-10 text-center">
            <PlusIcon aria-hidden="true" className="mx-auto size-10 text-zinc-400 dark:text-zinc-500" />
            <Text className="mt-2 text-center">{t.propertiesEmpty}</Text>
            <div className="mt-6">
              <Button color="indigo" href="/properties">
                <PlusIcon aria-hidden="true" />
                {t.addProperty}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
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
                    <TableCell className="font-medium text-zinc-950 dark:text-white">
                      {r.title ?? r.city ?? "Bien sans titre"}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">{r.status}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {r.property_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">{r.city ?? "—"}</TableCell>
                    <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                      {dateFr(r.updated_at)}
                    </TableCell>
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
