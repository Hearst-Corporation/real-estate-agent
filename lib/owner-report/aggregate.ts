/**
 * lib/owner-report/aggregate.ts — Agrégation PURE du tableau propriétaire.
 *
 * Prend les lignes RÉELLES lues sur GPU1 (visits, prosp_envois, rea_tasks,
 * mandates) et calcule les 3 blocs du tableau propriétaire :
 *   - activité      : nb visites (par statut), diffusions/contacts, dernière activité
 *   - retours       : synthèse des CR de visite (feedback) — UNAVAILABLE si aucun CR
 *   - actions       : prochaines actions (tâches à venir + visites planifiées futures)
 *
 * Aucune I/O ici : entrée = lignes brutes, sortie = structure d'affichage.
 * Toute valeur vient des données réelles ; une section vide rend un état honnête.
 */

/** Sous-ensembles typés des lignes DB consommées (colonnes réelles GPU1). */
export interface VisitRow {
  id: string;
  status: string;
  scheduled_at: string;
  feedback: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Publication/diffusion RÉELLE d'une annonce du bien (une ligne = le bien publié
 * sur une source). Source: prosp_annonces filtré sur property_id.
 */
export interface BroadcastRow {
  id: string;
  source: string;
  actif: boolean;
  date_publication: string | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  priority: string;
  due_at: string | null;
  notes: string | null;
  created_at: string;
}

/** Statuts de visite qui comptent comme "réalisée" (source: VISIT_STATUSES). */
const VISIT_DONE = "realisee";
/** Statuts de visite planifiés (à venir potentiellement). */
const VISIT_UPCOMING = new Set(["planifiee", "confirmee"]);
/** Statuts de tâche encore ouverts. */
const TASK_OPEN = new Set(["a_faire", "en_cours", "todo", "open", "pending"]);

export interface ActivityBlock {
  visitsTotal: number;
  visitsDone: number;
  visitsUpcoming: number;
  /** Nb total de publications/diffusions du bien (prosp_annonces). */
  broadcastsTotal: number;
  /** Nb de publications encore actives (annonce en ligne). */
  broadcastsActive: number;
  lastActivityAt: string | null;
  /** true si AUCUNE activité (aucune visite, aucune diffusion). */
  empty: boolean;
}

export interface FeedbackItem {
  visitId: string;
  at: string;
  text: string;
}

export interface FeedbackBlock {
  /** UNAVAILABLE = aucune visite réalisée n'a de CR (feedback/notes). */
  available: boolean;
  items: FeedbackItem[];
  /** Nombre de visites réalisées sans aucun CR renseigné. */
  missingReports: number;
}

export interface ActionItem {
  id: string;
  label: string;
  at: string | null;
  source: "task" | "visit";
  priority?: string;
}

export interface ActionsBlock {
  items: ActionItem[];
  empty: boolean;
}

export interface OwnerReport {
  activity: ActivityBlock;
  feedback: FeedbackBlock;
  actions: ActionsBlock;
}

function parseTs(s: string | null | undefined): number {
  if (!s) return NaN;
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

/** Choisit l'horodatage d'activité le plus récent parmi les lignes fournies. */
function maxTs(candidates: (string | null | undefined)[]): string | null {
  let bestIso: string | null = null;
  let best = -Infinity;
  for (const c of candidates) {
    const t = parseTs(c);
    if (!Number.isNaN(t) && t > best) {
      best = t;
      bestIso = c as string;
    }
  }
  return bestIso;
}

export function buildActivity(
  visits: VisitRow[],
  broadcasts: BroadcastRow[],
): ActivityBlock {
  const visitsDone = visits.filter((v) => v.status === VISIT_DONE).length;
  const visitsUpcoming = visits.filter((v) => VISIT_UPCOMING.has(v.status)).length;
  const broadcastsActive = broadcasts.filter((b) => b.actif).length;

  const lastActivityAt = maxTs([
    ...visits.map((v) => v.scheduled_at),
    ...visits.map((v) => v.created_at),
    ...broadcasts.map((b) => b.date_publication),
    ...broadcasts.map((b) => b.created_at),
  ]);

  return {
    visitsTotal: visits.length,
    visitsDone,
    visitsUpcoming,
    broadcastsTotal: broadcasts.length,
    broadcastsActive,
    lastActivityAt,
    empty: visits.length === 0 && broadcasts.length === 0,
  };
}

export function buildFeedback(visits: VisitRow[]): FeedbackBlock {
  const done = visits.filter((v) => v.status === VISIT_DONE);
  const items: FeedbackItem[] = [];
  let missingReports = 0;

  for (const v of done) {
    const text = (v.feedback ?? v.notes ?? "").trim();
    if (text) {
      items.push({ visitId: v.id, at: v.scheduled_at ?? v.created_at, text });
    } else {
      missingReports += 1;
    }
  }

  // Plus récent d'abord.
  items.sort((a, b) => parseTs(b.at) - parseTs(a.at));

  return {
    // UNAVAILABLE honnête : aucune visite réalisée n'a de CR → on n'invente rien.
    available: items.length > 0,
    items,
    missingReports,
  };
}

/**
 * Prochaines actions : tâches ouvertes (échéance future ou sans échéance) +
 * visites planifiées à venir. `now` injectable pour testabilité.
 */
export function buildActions(
  tasks: TaskRow[],
  visits: VisitRow[],
  now: Date = new Date(),
): ActionsBlock {
  const nowMs = now.getTime();
  const items: ActionItem[] = [];

  for (const t of tasks) {
    if (!TASK_OPEN.has(t.status)) continue;
    const due = parseTs(t.due_at);
    // On garde les tâches sans échéance et celles à échéance future.
    if (!Number.isNaN(due) && due < nowMs) continue;
    items.push({
      id: t.id,
      label: t.title,
      at: t.due_at,
      source: "task",
      priority: t.priority,
    });
  }

  for (const v of visits) {
    if (!VISIT_UPCOMING.has(v.status)) continue;
    const at = parseTs(v.scheduled_at);
    if (Number.isNaN(at) || at < nowMs) continue;
    items.push({
      id: v.id,
      label: "Visite programmée",
      at: v.scheduled_at,
      source: "visit",
    });
  }

  // Échéances les plus proches d'abord ; sans date en fin.
  items.sort((a, b) => {
    const ta = parseTs(a.at);
    const tb = parseTs(b.at);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });

  return { items, empty: items.length === 0 };
}

export function buildOwnerReport(input: {
  visits: VisitRow[];
  broadcasts: BroadcastRow[];
  tasks: TaskRow[];
  now?: Date;
}): OwnerReport {
  return {
    activity: buildActivity(input.visits, input.broadcasts),
    feedback: buildFeedback(input.visits),
    actions: buildActions(input.tasks, input.visits, input.now),
  };
}
