import { UI } from "@/lib/ui-strings";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { dateFr } from "@/lib/crm/format";
import { filterSeed } from "@/lib/crm/demo-filter";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { Text } from "@/components/ui/text";
import { Link } from "@/components/ui/link";
import { ActionCenter } from "@/components/cockpit/ActionCenter";
import { AzigoWatermark } from "@/components/cockpit/AzigoWatermark";
import { EmptyState } from "@/components/cockpit/EmptyState";
import { DASHBOARD_ANCHORS } from "@/lib/onboarding/tours";
import { buildActionCenter, type DeriveInput, type DeriveLabels } from "@/lib/actions/derive";
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
const FETCH_LIMIT = 200;

/** CTA principal unique — or plein, texte foncé (contraste AA sur l'accent). */
const PRIMARY_CTA =
  "group inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[var(--shadow-card)] transition-[background-color,box-shadow] duration-200 hover:bg-accent-400 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700";

type PropertyRow = {
  id: string;
  title: string | null;
  status: string;
  city: string | null;
  property_type: string | null;
  updated_at: string;
};

/** Instant courant (isolé dans une fonction pour rester hors du corps de rendu). */
function currentInstant(): { ms: number; iso: string } {
  const ms = Date.now();
  return { ms, iso: new Date(ms).toISOString() };
}

/** Construit les libellés de dérivation depuis UI.* (aucun texte en dur dans derive.ts). */
function deriveLabels(): DeriveLabels {
  const c = UI.dashboard.center;
  return {
    staleFor: c.reasons.staleFor,
    visitWith: c.reasons.visitWith,
    today: c.groups.today,
    rdvOn: () => c.reasons.rdvOn,
    estimationResume: c.reasons.estimationResume,
    acquereurNoProposal: c.reasons.acquereurNoProposal,
    matchToReview: c.reasons.matchToReview,
    proprietaireToCall: c.reasons.proprietaireToCall,
    mandateDraft: c.reasons.mandateDraft,
    taskDue: c.reasons.taskDue,
    taskOverdue: c.reasons.taskOverdue,
    taskOpen: c.reasons.taskOpen,
    validationNeeded: c.reasons.validationNeeded,
    fallbackLead: c.fallback.lead,
    fallbackProperty: c.fallback.property,
    fallbackEstimation: c.fallback.estimation,
    fallbackMandate: c.fallback.mandate,
    fallbackCritere: c.fallback.critere,
  };
}

export default async function DashboardPage() {
  const claims = await getSession();
  const sb = getGpu1Admin();

  let properties: PropertyRow[] = [];
  let nbLeadsActifs = 0;
  let nbVisitesAVenir = 0;
  let nbMandatsActifs = 0;
  let nbProperties = 0;

  const { ms: nowMs, iso: nowIso } = currentInstant();

  // Entrées de dérivation du centre d'actions (toutes LIVE, owner-scopées).
  const derive: DeriveInput = {
    tasks: [],
    leads: [],
    visits: [],
    estimations: [],
    mandates: [],
    criteres: [],
    matchs: [],
  };

  if (claims && sb) {
    const uid = claims.sub;
    const tid = tenantOf(claims);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as any;

    const [
      propertiesRes,
      propertiesTotalRes,
      leadsCountRes,
      visitsCountRes,
      mandatesCountRes,
      tasksRes,
      leadsRes,
      visitsRes,
      estimationsRes,
      mandatesRes,
      criteresRes,
      matchsRes,
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
        .select("id, status", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("status", "in", `(${LEADS_CLOSED.join(",")})`),
      // KPI : visites à venir
      sb
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", nowIso),
      // KPI : mandats actifs
      sb
        .from("mandates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "actif"),
      // Centre d'actions : tâches persistées ouvertes / reportées
      sbAny
        .from("rea_tasks")
        .select("id, entity_type, entity_id, kind, title, priority, due_at, status, snoozed_until, notes")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .in("status", ["open", "snoozed"])
        .limit(FETCH_LIMIT),
      // Centre d'actions : leads (relances + propriétaires)
      sb
        .from("leads")
        .select("id, full_name, kind, status, phone, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: true })
        .limit(FETCH_LIMIT),
      // Centre d'actions : visites (RDV du jour + à venir) avec liens entités
      sb
        .from("visits")
        .select("id, scheduled_at, status, property_id, lead_id, properties(title, city), leads(full_name)")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(FETCH_LIMIT),
      // Centre d'actions : estimations à reprendre
      sb
        .from("estimations")
        .select("id, city, property_type, status, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("updated_at", { ascending: false })
        .limit(FETCH_LIMIT),
      // Centre d'actions : mandats brouillon (opportunités)
      sb
        .from("mandates")
        .select("id, reference, status, expires_at, properties(title, city)")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("status", "brouillon")
        .limit(FETCH_LIMIT),
      // Centre d'actions : critères acquéreur actifs
      sbAny
        .from("prosp_criteres_acquereur")
        .select("id, nom, lead_id, actif, updated_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .eq("actif", true)
        .limit(FETCH_LIMIT),
      // Centre d'actions : matchs récents (score desc)
      sbAny
        .from("prosp_matchs")
        .select("id, score_match, critere_id, created_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
    ]);

    properties = filterSeed((propertiesRes.data ?? []) as PropertyRow[], (p) => [p.title, p.city]);
    nbProperties = propertiesTotalRes.count ?? 0;
    nbLeadsActifs = leadsCountRes.count ?? 0;
    nbVisitesAVenir = visitsCountRes.count ?? 0;
    nbMandatsActifs = mandatesCountRes.count ?? 0;

    // On masque les données de SEED des relances/propriétaires (comme les listes).
    derive.tasks = (tasksRes.data ?? []) as DeriveInput["tasks"];
    derive.leads = filterSeed(
      (leadsRes.data ?? []) as DeriveInput["leads"],
      (l) => [l.full_name],
    );
    derive.visits = (visitsRes.data ?? []) as unknown as DeriveInput["visits"];
    derive.estimations = filterSeed(
      (estimationsRes.data ?? []) as DeriveInput["estimations"],
      (e) => [e.city],
    );
    derive.mandates = (mandatesRes.data ?? []) as unknown as DeriveInput["mandates"];
    derive.criteres = filterSeed(
      (criteresRes.data ?? []) as DeriveInput["criteres"],
      (c) => [c.nom],
    );
    derive.matchs = (matchsRes.data ?? []) as DeriveInput["matchs"];
  }

  const t = UI.dashboard;
  const { items: actionItems } = buildActionCenter(derive, nowMs, deriveLabels());

  // Libellés des bandes temporelles du centre d'actions (urgent → aujourd'hui →
  // ensuite). Réutilise des clés UI existantes — aucun texte en dur, aucune
  // nouvelle clé requise dans lib/ui-strings.ts.
  const bucketLabels = {
    urgent: t.center.groups.overdue,
    today: t.center.groups.today,
    next: UI.visits.upcoming,
  };

  const kpis = [
    { label: t.kpis.properties, value: String(nbProperties), icon: "properties" as IconName },
    { label: t.kpis.activeLeads, value: String(nbLeadsActifs), icon: "leads" as IconName },
    { label: t.kpis.upcomingVisits, value: String(nbVisitesAVenir), icon: "visits" as IconName },
    { label: t.kpis.activeMandates, value: String(nbMandatsActifs), icon: "mandates" as IconName },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
      {/* Header — zone héro (profondeur niveau 3 + filigrane Azigo discret) :
          eyebrow + titre court + action principale UNIQUE (or). */}
      <header className="section-hero flex flex-wrap items-end justify-between gap-4 px-6 py-6 sm:px-8 sm:py-7">
        <AzigoWatermark placement="hero" />
        <div className="relative min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-600">
            <span aria-hidden className="h-px w-6 bg-accent-500/70" />
            {t.eyebrow}
          </p>
          <h1 className="mt-2 font-titre text-3xl font-semibold tracking-tight text-zinc-900">
            {t.title}
          </h1>
        </div>
        <Link
          href="/estimations/new"
          className={`relative ${PRIMARY_CTA}`}
          data-tour-id={DASHBOARD_ANCHORS.newEstimation}
        >
          <Icon name="estimate" className="size-5" />
          {t.actions.newEstimation}
        </Link>
      </header>

      {/* KPI — bandeau léger à filets or (pas 4 cartes encagées) */}
      <dl
        data-tour-id={DASHBOARD_ANCHORS.kpis}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-accent-500/12 bg-accent-500/15 shadow-[var(--shadow-card)] @xl:grid-cols-4"
      >
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

      {/* (a) CENTRE D'ACTIONS — bloc dominant : quoi faire, pour qui, pourquoi.
          Regroupé par bande temporelle (urgent → aujourd'hui → ensuite). */}
      <ActionCenter items={actionItems} bucketLabels={bucketLabels} />

      {/* (b) PORTEFEUILLE RÉCENT.
          La section « Actions rapides » (créer bien/client/visite) a été retirée :
          100 % redondante avec le menu « Créer » du rail gauche (toujours visible)
          et le CTA principal du header. Zéro fonction perdue, moins de CTA à trier. */}
      <section data-tour-id={DASHBOARD_ANCHORS.recentProperties}>
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
          <EmptyState
            icon={<Icon name="properties" className="size-6" />}
            description={t.propertiesEmpty}
            action={
              <Link href="/properties?new=1" className={PRIMARY_CTA}>
                <Icon name="plus" className="size-5" />
                {t.addProperty}
              </Link>
            }
          />
        ) : (
          <div className="surface overflow-hidden px-5 py-2">
            <Table dense grid>
              <TableHead>
                <TableRow>
                  <TableHeader>{UI.dashboard.table.property}</TableHeader>
                  <TableHeader>{UI.dashboard.table.status}</TableHeader>
                  <TableHeader>{UI.dashboard.table.type}</TableHeader>
                  <TableHeader>{UI.dashboard.table.city}</TableHeader>
                  <TableHeader className="text-right">{UI.dashboard.table.updated}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {properties.map((r) => (
                  <TableRow key={r.id} href={`/properties/${r.id}`}>
                    <TableCell className="font-medium text-zinc-950">
                      {r.title ?? r.city ?? UI.dashboard.center.fallback.property}
                    </TableCell>
                    <TableCell className="text-zinc-500">{r.status}</TableCell>
                    <TableCell className="text-zinc-500">{r.property_type ?? UI.common.empty}</TableCell>
                    <TableCell className="text-zinc-500">{r.city ?? UI.common.empty}</TableCell>
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
