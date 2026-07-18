/**
 * lib/action-center/score.ts — SCORING DÉTERMINISTE & EXPLICABLE (W1).
 *
 * Fonctions PURES : même entrée → même score, aucun aléa, aucun modèle opaque.
 * Chaque score est la SOMME de contributions nommées (poids constants ci-dessous),
 * plafonnée à 100. On expose la ventilation (`explanation`) pour que l'UI puisse
 * dire « pourquoi cette carte est en haut » sans jamais inventer de chiffre.
 *
 * Formule (toutes contributions ≥ 0) :
 *   score = base(catégorie)
 *         + priorityBonus(priorité)
 *         + urgence temporelle :  overdue(jours de retard, borné)
 *                              OU dueSoon(échéance aujourd'hui/imminente)
 *         + signalStrength(force du signal radar, si carte radar)
 *   score = min(100, score)
 *
 * Tous les poids vivent dans WEIGHTS (zéro magic number dispersé, surchargeables via env).
 */

import type { ActionCategory, ActionItem, ActionPriority } from "@/lib/actions/types";
import type { ScoreContribution, ScoreFactor, ScoredAction } from "@/lib/action-center/types";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const MS_PER_DAY = 86_400_000;

/**
 * Poids nommés du scoring. `base` capture « à quel point cette catégorie compte
 * dans une journée d'agent immobilier » ; les bonus modulent selon l'urgence réelle.
 * Ordre voulu : ce qui est EN RETARD / à VALIDER prime, puis le business chaud
 * (mandats, propriétaires), puis les relances, puis le reste.
 */
export const WEIGHTS = {
  /** Poids de base par catégorie (déterministe, borné, jamais deviné). */
  base: {
    overdue: envInt("AC_BASE_OVERDUE", 55),
    validation: envInt("AC_BASE_VALIDATION", 52),
    today: envInt("AC_BASE_TODAY", 48),
    mandat: envInt("AC_BASE_MANDAT", 46),
    proprietaire: envInt("AC_BASE_PROPRIETAIRE", 42),
    rdv: envInt("AC_BASE_RDV", 40),
    relance: envInt("AC_BASE_RELANCE", 36),
    task: envInt("AC_BASE_TASK", 34),
    match: envInt("AC_BASE_MATCH", 30),
    estimation: envInt("AC_BASE_ESTIMATION", 28),
    acquereur: envInt("AC_BASE_ACQUEREUR", 24),
  } as Record<ActionCategory, number>,
  /** Bonus de priorité métier (portée par l'ActionItem). */
  priority: {
    haute: envInt("AC_PRIO_HAUTE", 20),
    normale: envInt("AC_PRIO_NORMALE", 8),
    basse: envInt("AC_PRIO_BASSE", 0),
  } as Record<ActionPriority, number>,
  /** Bonus max de retard (atteint au-delà de OVERDUE_SATURATION_DAYS jours). */
  overdueMax: envInt("AC_OVERDUE_MAX", 25),
  /** Nb de jours de retard à partir duquel le bonus de retard sature. */
  overdueSaturationDays: envInt("AC_OVERDUE_SATURATION_DAYS", 14),
  /** Bonus si l'échéance est aujourd'hui ou dans les prochaines heures. */
  dueSoon: envInt("AC_DUE_SOON", 12),
  /** Fenêtre (heures) pour considérer une échéance « imminente ». */
  dueSoonWindowHours: envInt("AC_DUE_SOON_WINDOW_HOURS", 24),
  /** Bonus max apporté par la force d'un signal radar (0..signalMax). */
  signalMax: envInt("AC_SIGNAL_MAX", 25),
} as const;

/** Score plancher/plafond. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Retard en jours (≥ 0) entre `when` et `nowMs`. Non daté → 0. */
function daysOverdue(when: string | undefined, nowMs: number): number {
  if (!when) return 0;
  const t = Date.parse(when);
  if (!Number.isFinite(t)) return 0;
  const diff = nowMs - t;
  return diff <= 0 ? 0 : Math.floor(diff / MS_PER_DAY);
}

/** Heures restantes avant `when` (peut être < 0). Non daté → null. */
function hoursUntil(when: string | undefined, nowMs: number): number | null {
  if (!when) return null;
  const t = Date.parse(when);
  if (!Number.isFinite(t)) return null;
  return (t - nowMs) / 3_600_000;
}

/**
 * Force d'un signal radar, normalisée 0..1 puis mise à l'échelle signalMax.
 * `signalStrength` est fourni par l'adaptateur radar (voir aggregate.ts) : c'est
 * un ratio déterministe (drop_pct/100, ancienneté/plafond, urgence expiration).
 * Absent (item non-radar) → 0.
 */
function signalPoints(strength: number | undefined): number {
  if (strength == null || !Number.isFinite(strength)) return 0;
  const clamped = Math.max(0, Math.min(1, strength));
  return Math.round(clamped * WEIGHTS.signalMax);
}

/**
 * Calcule le score d'un ActionItem enrichi. `signalStrength` (0..1) n'est présent
 * que pour les cartes radar. Renvoie l'item complété du score, de la ventilation
 * nommée et du facteur dominant. Purement déterministe.
 */
export function scoreAction(
  item: ActionItem,
  nowMs: number,
  signalStrength?: number,
): ScoredAction {
  const contributions: ScoreContribution[] = [];

  // 1) Base de catégorie.
  const base = WEIGHTS.base[item.category] ?? 20;
  contributions.push({ factor: "base", points: base });

  // 2) Priorité métier.
  const prio = WEIGHTS.priority[item.priority] ?? 0;
  if (prio > 0) contributions.push({ factor: "priority", points: prio });

  // 3) Urgence temporelle — retard OU imminence (jamais les deux).
  const overdueDays = daysOverdue(item.when, nowMs);
  if (overdueDays > 0) {
    const ratio = Math.min(1, overdueDays / WEIGHTS.overdueSaturationDays);
    const pts = Math.round(ratio * WEIGHTS.overdueMax);
    if (pts > 0) contributions.push({ factor: "overdue", points: pts });
  } else {
    const h = hoursUntil(item.when, nowMs);
    if (h != null && h >= 0 && h <= WEIGHTS.dueSoonWindowHours) {
      contributions.push({ factor: "dueSoon", points: WEIGHTS.dueSoon });
    }
  }

  // 4) Force du signal radar (0 pour tout item non-radar).
  const sig = signalPoints(signalStrength);
  if (sig > 0) contributions.push({ factor: "signalStrength", points: sig });

  const raw = contributions.reduce((s, c) => s + c.points, 0);
  const score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, raw));

  // Facteur dominant = plus forte contribution (départage stable par ordre d'ajout).
  let topFactor: ScoreFactor = "base";
  let topPts = -1;
  for (const c of contributions) {
    if (c.points > topPts) {
      topPts = c.points;
      topFactor = c.factor;
    }
  }

  return { ...item, score, explanation: contributions, topFactor };
}

/**
 * Tri déterministe des cartes scorées : score décroissant, puis échéance croissante
 * (le plus urgent daté d'abord), puis id (stable). Ne mute pas l'entrée.
 */
export function sortScored(items: ScoredAction[]): ScoredAction[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aw = a.when ? Date.parse(a.when) : Number.MAX_SAFE_INTEGER;
    const bw = b.when ? Date.parse(b.when) : Number.MAX_SAFE_INTEGER;
    if (aw !== bw) return aw - bw;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
