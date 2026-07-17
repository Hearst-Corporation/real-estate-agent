/**
 * lib/actions/derive.ts — DÉRIVATION du centre d'actions à partir de données LIVE.
 *
 * Fonctions PURES : elles reçoivent des lignes déjà lues (owner-scoped user+tenant
 * côté appelant) et produisent des ActionItem typées, chacune rattachée à une vraie
 * entité. Aucune I/O, aucune fabrication de donnée. Zéro dépendance React.
 *
 * D'où vient chaque catégorie (toutes LIVE) :
 *   overdue     ← rea_tasks (status=open, due_at < now)
 *   today       ← rea_tasks (due aujourd'hui) + visits (aujourd'hui)
 *   relance     ← leads acheteur non touchés depuis N jours (updated_at)
 *   rdv         ← visits à venir (scheduled_at ≥ now)
 *   estimation  ← estimations status ∈ {draft, interviewing, recap, valuating}
 *   acquereur   ← prosp_criteres_acquereur actifs sans match récent (< N jours)
 *   match       ← prosp_matchs récents à examiner (score ≥ seuil)
 *   proprietaire← leads vendeur à rappeler (status ouvert, ancienneté)
 *   mandat      ← mandates status='brouillon' (opportunité)
 *   validation  ← rea_tasks kind='validation' (status=open)
 */

import { daysSince } from "@/lib/crm/format";
import type {
  ActionCategory,
  ActionCounts,
  ActionItem,
  QuickAction,
} from "@/lib/actions/types";

// ─── Seuils métier (pas de magic number en dur dans la logique) ───────────────

/** Un lead non touché depuis ce nb de jours devient « à relancer ». */
export const RELANCE_STALE_DAYS = 7;
/** Un critère acquéreur actif sans match depuis ce nb de jours = « sans proposition récente ». */
export const ACQUEREUR_STALE_DAYS = 7;
/** Un match récent (≤ ce nb de jours) mérite examen. */
export const MATCH_RECENT_DAYS = 14;
/** Score minimal d'un match pour figurer dans « à examiner ». */
export const MATCH_MIN_SCORE = 60;
/** Statuts d'estimation « à reprendre » (travail inachevé). */
export const ESTIMATION_RESUME_STATUSES = ["draft", "interviewing", "recap", "valuating"];
/** Statuts de lead considérés « clos » (exclus des relances). */
const LEAD_CLOSED = ["gagne", "perdu"];

// ─── Types d'entrée (sous-ensembles des lignes réelles) ───────────────────────

export type TaskRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  kind: string;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
  snoozed_until: string | null;
  notes: string | null;
};

export type LeadRow = {
  id: string;
  full_name: string | null;
  kind: string | null;
  status: string;
  phone: string | null;
  updated_at: string;
};

export type VisitRow = {
  id: string;
  scheduled_at: string;
  status: string;
  property_id: string | null;
  lead_id: string | null;
  properties: { title: string | null; city: string | null } | null;
  leads: { full_name: string | null } | null;
};

export type EstimationRow = {
  id: string;
  city: string | null;
  property_type: string | null;
  status: string;
  updated_at: string;
};

export type MandateRow = {
  id: string;
  reference: string | null;
  status: string;
  expires_at: string | null;
  properties: { title: string | null; city: string | null } | null;
};

export type CritereRow = {
  id: string;
  nom: string | null;
  lead_id: string | null;
  actif: boolean | null;
  updated_at: string;
};

export type MatchRow = {
  id: string;
  score_match: number | null;
  critere_id: string | null;
  created_at: string;
};

/** Libellés courts injectés par l'appelant (viennent de UI.*, jamais en dur ici). */
export type DeriveLabels = {
  /** ex. (n) => `Non recontacté depuis ${n} j` */
  staleFor: (days: number) => string;
  /** ex. (city, type) => `${city} · ${type}` */
  visitWith: (who: string) => string;
  today: string;
  /** Verbe + date pour un RDV. */
  rdvOn: (when: string) => string;
  estimationResume: string;
  acquereurNoProposal: string;
  matchToReview: (score: number) => string;
  proprietaireToCall: string;
  mandateDraft: string;
  taskDue: string;
  taskOverdue: string;
  taskOpen: string;
  validationNeeded: string;
  fallbackLead: string;
  fallbackProperty: string;
  fallbackEstimation: string;
  fallbackMandate: string;
  fallbackCritere: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function taskPriority(p: string): ActionItem["priority"] {
  return p === "haute" || p === "basse" ? p : "normale";
}

/** Convertit une entity_type texte (rea_tasks) en href de fiche. */
function taskHref(entityType: string, entityId: string | null): string {
  switch (entityType) {
    case "lead":
      return entityId ? `/leads/${entityId}` : "/leads";
    case "property":
      return entityId ? `/properties/${entityId}` : "/properties";
    case "estimation":
      return entityId ? `/estimations/${entityId}` : "/estimations";
    case "mandate":
      return "/mandates";
    case "visit":
      return "/agenda";
    case "annonce":
      return "/prospection";
    case "match":
      return "/prospection";
    default:
      return "/";
  }
}

function isActionEntity(t: string): ActionItem["entity"] {
  const ok = ["lead", "property", "estimation", "mandate", "visit", "annonce", "match"];
  return (ok.includes(t) ? t : "general") as ActionItem["entity"];
}

// ─── Dérivations (une par catégorie) ──────────────────────────────────────────

/** Tâches persistées échues (status=open, due_at passé). */
export function deriveOverdueTasks(tasks: TaskRow[], nowMs: number, L: DeriveLabels): ActionItem[] {
  return tasks
    .filter((t) => t.status === "open" && t.due_at != null && new Date(t.due_at).getTime() < nowMs)
    .map((t) => taskToItem(t, "overdue", L, L.taskOverdue));
}

/** Tâches persistées dues aujourd'hui (status=open). */
export function deriveTodayTasks(tasks: TaskRow[], nowMs: number, L: DeriveLabels): ActionItem[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        t.due_at != null &&
        t.due_at.slice(0, 10) === today &&
        new Date(t.due_at).getTime() >= nowMs,
    )
    .map((t) => taskToItem(t, "today", L, L.taskDue));
}

/** Tâches de validation en attente (kind=validation, status=open). */
export function deriveValidationTasks(tasks: TaskRow[], L: DeriveLabels): ActionItem[] {
  return tasks
    .filter((t) => t.status === "open" && t.kind === "validation")
    .map((t) => taskToItem(t, "validation", L, L.validationNeeded));
}

/**
 * Tâches persistées ouvertes restantes — celles NON déjà surfacées ailleurs :
 * ni échues (overdue), ni dues aujourd'hui (today), ni validation. Ex. un
 * « message à envoyer » ou un « suivi » sans échéance. Garantit qu'aucune tâche
 * persistée n'est invisible (on doit pouvoir la traiter / reporter).
 */
export function deriveOpenTasks(tasks: TaskRow[], nowMs: number, L: DeriveLabels): ActionItem[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return tasks
    .filter((t) => {
      if (t.status !== "open") return false;
      if (t.kind === "validation") return false;
      // Échue → overdue ; due aujourd'hui → today. On ne garde que le reste.
      if (t.due_at != null) {
        const ms = new Date(t.due_at).getTime();
        if (ms < nowMs) return false;
        if (t.due_at.slice(0, 10) === today) return false;
      }
      return true;
    })
    .map((t) => taskToItem(t, "task", L, L.taskOpen));
}

function taskToItem(
  t: TaskRow,
  category: ActionCategory,
  L: DeriveLabels,
  reason: string,
): ActionItem {
  const href = taskHref(t.entity_type, t.entity_id);
  const quick: QuickAction[] = [{ kind: "open", href }];
  if (t.kind === "validation") quick.push({ kind: "validate" });
  quick.push({ kind: "snooze" }, { kind: "done" });
  return {
    id: t.id,
    category,
    entity: isActionEntity(t.entity_type),
    entityId: t.entity_id,
    title: t.title,
    reason: t.notes ? `${reason} · ${t.notes}` : reason,
    priority: taskPriority(t.priority),
    when: t.due_at ?? undefined,
    href,
    quick,
    taskId: t.id,
    taskStatus: t.status === "done" || t.status === "snoozed" ? t.status : "open",
  };
}

/** Leads acheteur non touchés depuis RELANCE_STALE_DAYS (status ouvert). */
export function deriveRelances(leads: LeadRow[], L: DeriveLabels): ActionItem[] {
  return leads
    .filter(
      (l) =>
        (l.kind === "acheteur" || l.kind == null) &&
        !LEAD_CLOSED.includes(l.status) &&
        (daysSince(l.updated_at) ?? 0) >= RELANCE_STALE_DAYS,
    )
    .map((l) => {
      const d = daysSince(l.updated_at) ?? 0;
      const quick: QuickAction[] = [{ kind: "open", href: `/leads/${l.id}` }];
      if (l.phone) quick.push({ kind: "call", phone: l.phone });
      quick.push({ kind: "message", leadId: l.id });
      return {
        id: `relance:${l.id}`,
        category: "relance" as const,
        entity: "lead" as const,
        entityId: l.id,
        title: l.full_name ?? L.fallbackLead,
        reason: L.staleFor(d),
        priority: d >= RELANCE_STALE_DAYS * 2 ? ("haute" as const) : ("normale" as const),
        when: l.updated_at,
        href: `/leads/${l.id}`,
        quick,
      };
    });
}

/** Propriétaires (leads vendeur) à rappeler — status ouvert. */
export function deriveProprietaires(leads: LeadRow[], L: DeriveLabels): ActionItem[] {
  return leads
    .filter((l) => l.kind === "vendeur" && !LEAD_CLOSED.includes(l.status))
    .map((l) => {
      const d = daysSince(l.updated_at) ?? 0;
      const quick: QuickAction[] = [{ kind: "open", href: `/leads/${l.id}` }];
      if (l.phone) quick.push({ kind: "call", phone: l.phone });
      quick.push({ kind: "message", leadId: l.id });
      return {
        id: `proprietaire:${l.id}`,
        category: "proprietaire" as const,
        entity: "lead" as const,
        entityId: l.id,
        title: l.full_name ?? L.fallbackLead,
        reason: d >= RELANCE_STALE_DAYS ? L.staleFor(d) : L.proprietaireToCall,
        priority: d >= RELANCE_STALE_DAYS ? ("haute" as const) : ("normale" as const),
        when: l.updated_at,
        href: `/leads/${l.id}`,
        quick,
      };
    });
}

/** Visites à venir (scheduled_at ≥ now). `dayOnly=true` → seulement aujourd'hui. */
export function deriveRdv(
  visits: VisitRow[],
  nowMs: number,
  L: DeriveLabels,
  dayOnly = false,
): ActionItem[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return visits
    .filter((v) => {
      const ms = new Date(v.scheduled_at).getTime();
      if (ms < nowMs) return false;
      return dayOnly ? v.scheduled_at.slice(0, 10) === today : true;
    })
    .map((v) => {
      const who = v.leads?.full_name ?? null;
      const propTitle = v.properties?.title ?? v.properties?.city ?? L.fallbackProperty;
      const quick: QuickAction[] = [];
      // Agenda et fiches liées : la visite pointe sur son bien, secondairement le lead.
      if (v.property_id) quick.push({ kind: "open", href: `/properties/${v.property_id}` });
      if (v.lead_id) quick.push({ kind: "open", href: `/leads/${v.lead_id}` });
      if (quick.length === 0) quick.push({ kind: "open", href: "/agenda" });
      return {
        id: dayOnly ? `today-rdv:${v.id}` : `rdv:${v.id}`,
        category: (dayOnly ? "today" : "rdv") as ActionCategory,
        entity: "visit" as const,
        entityId: v.id,
        title: propTitle,
        reason: who ? L.visitWith(who) : L.rdvOn(""),
        priority: dayOnly ? ("haute" as const) : ("normale" as const),
        when: v.scheduled_at,
        href: v.property_id ? `/properties/${v.property_id}` : "/agenda",
        quick,
      };
    });
}

/** Estimations à reprendre (travail inachevé). */
export function deriveEstimations(rows: EstimationRow[], L: DeriveLabels): ActionItem[] {
  return rows
    .filter((e) => ESTIMATION_RESUME_STATUSES.includes(e.status))
    .map((e) => ({
      id: `estimation:${e.id}`,
      category: "estimation" as const,
      entity: "estimation" as const,
      entityId: e.id,
      title: e.city ?? L.fallbackEstimation,
      reason: L.estimationResume,
      priority: "normale" as const,
      when: e.updated_at,
      href: `/estimations/${e.id}`,
      quick: [{ kind: "open", href: `/estimations/${e.id}` }],
    }));
}

/** Opportunités de mandat : mandates status='brouillon'. */
export function deriveMandats(rows: MandateRow[], L: DeriveLabels): ActionItem[] {
  return rows
    .filter((m) => m.status === "brouillon")
    .map((m) => ({
      id: `mandat:${m.id}`,
      category: "mandat" as const,
      entity: "mandate" as const,
      entityId: m.id,
      title: m.properties?.title ?? m.reference ?? L.fallbackMandate,
      reason: L.mandateDraft,
      priority: "haute" as const,
      when: m.expires_at ?? undefined,
      href: "/mandates",
      quick: [{ kind: "open", href: "/mandates" }],
    }));
}

/**
 * Acquéreurs (critères actifs) sans match récent : le critère existe mais aucun
 * prosp_matchs de moins de ACQUEREUR_STALE_DAYS ⇒ aucune proposition récente.
 */
export function deriveAcquereursSansProposition(
  criteres: CritereRow[],
  matchs: MatchRow[],
  nowMs: number,
  L: DeriveLabels,
): ActionItem[] {
  const recentByCritere = new Set(
    matchs
      .filter((m) => (daysSince(m.created_at) ?? Number.MAX_SAFE_INTEGER) < ACQUEREUR_STALE_DAYS)
      .map((m) => m.critere_id)
      .filter((id): id is string => id != null),
  );
  return criteres
    .filter((c) => c.actif === true && !recentByCritere.has(c.id))
    .map((c) => {
      // Un critère est rattaché à un lead (acquéreur) → la fiche cliquable est le lead.
      const href = c.lead_id ? `/leads/${c.lead_id}` : "/prospection";
      const quick: QuickAction[] = [{ kind: "open", href }];
      return {
        id: `acquereur:${c.id}`,
        category: "acquereur" as const,
        entity: (c.lead_id ? "lead" : "annonce") as ActionItem["entity"],
        entityId: c.lead_id ?? c.id,
        title: c.nom ?? L.fallbackCritere,
        reason: L.acquereurNoProposal,
        priority: "normale" as const,
        href,
        quick,
      };
    });
}

/** Matchs récents à examiner (score ≥ seuil, ≤ MATCH_RECENT_DAYS). */
export function deriveMatchs(matchs: MatchRow[], L: DeriveLabels): ActionItem[] {
  return matchs
    .filter(
      (m) =>
        (m.score_match ?? 0) >= MATCH_MIN_SCORE &&
        (daysSince(m.created_at) ?? Number.MAX_SAFE_INTEGER) <= MATCH_RECENT_DAYS,
    )
    .map((m) => {
      const score = m.score_match ?? 0;
      return {
        id: `match:${m.id}`,
        category: "match" as const,
        entity: "match" as const,
        entityId: m.id,
        title: L.matchToReview(score),
        reason: L.matchToReview(score),
        priority: score >= 85 ? ("haute" as const) : ("normale" as const),
        when: m.created_at,
        href: "/prospection",
        quick: [{ kind: "open", href: "/prospection" }],
      };
    });
}

// ─── Agrégation ───────────────────────────────────────────────────────────────

export type DeriveInput = {
  tasks: TaskRow[];
  leads: LeadRow[];
  visits: VisitRow[];
  estimations: EstimationRow[];
  mandates: MandateRow[];
  criteres: CritereRow[];
  matchs: MatchRow[];
};

/** Ordre d'affichage / priorité des catégories (urgent d'abord). */
export const CATEGORY_ORDER: ActionCategory[] = [
  "overdue",
  "today",
  "validation",
  "task",
  "rdv",
  "relance",
  "proprietaire",
  "mandat",
  "estimation",
  "acquereur",
  "match",
];

const PRIORITY_RANK: Record<ActionItem["priority"], number> = { haute: 0, normale: 1, basse: 2 };

/**
 * Construit tous les items du centre d'actions, triés par priorité puis échéance.
 * `nowMs` injecté (un seul instant) pour des fenêtres cohérentes + tests stables.
 */
export function buildActionCenter(
  input: DeriveInput,
  nowMs: number,
  L: DeriveLabels,
): { items: ActionItem[]; counts: ActionCounts } {
  const items: ActionItem[] = [
    ...deriveOverdueTasks(input.tasks, nowMs, L),
    ...deriveTodayTasks(input.tasks, nowMs, L),
    ...deriveRdv(input.visits, nowMs, L, true), // RDV du jour → catégorie "today"
    ...deriveValidationTasks(input.tasks, L),
    ...deriveOpenTasks(input.tasks, nowMs, L),
    ...deriveRdv(input.visits, nowMs, L, false),
    ...deriveRelances(input.leads, L),
    ...deriveProprietaires(input.leads, L),
    ...deriveMandats(input.mandates, L),
    ...deriveEstimations(input.estimations, L),
    ...deriveAcquereursSansProposition(input.criteres, input.matchs, nowMs, L),
    ...deriveMatchs(input.matchs, L),
  ];

  // Dédup : une visite du jour apparaît en "today" ; on la retire de "rdv".
  const todayVisitIds = new Set(
    items.filter((i) => i.category === "today" && i.entity === "visit").map((i) => i.entityId),
  );
  const deduped = items.filter(
    (i) => !(i.category === "rdv" && i.entity === "visit" && todayVisitIds.has(i.entityId)),
  );

  deduped.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const aw = a.when ? new Date(a.when).getTime() : Number.MAX_SAFE_INTEGER;
    const bw = b.when ? new Date(b.when).getTime() : Number.MAX_SAFE_INTEGER;
    return aw - bw;
  });

  const counts = CATEGORY_ORDER.reduce((acc, c) => {
    acc[c] = deduped.filter((i) => i.category === c).length;
    return acc;
  }, {} as ActionCounts);

  return { items: deduped, counts };
}
