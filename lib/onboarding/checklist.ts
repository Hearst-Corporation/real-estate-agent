/**
 * lib/onboarding/checklist.ts — LOGIQUE PURE de la checklist de démarrage (W6).
 * =================================================================
 *
 * DOCTRINE : la complétion est **DÉRIVÉE DES DONNÉES RÉELLES**, jamais d'une
 * case que l'utilisateur coche. Six items sur sept se lisent en base (un `leads`
 * existe, un `properties` existe, …) ; le septième — « consulter le Centre
 * d'actions » — n'a AUCUNE trace métier en base, il se dérive donc de la
 * progression du tour socle (étape `actionCenter` atteinte, ou tour terminé).
 *
 * ── HONNÊTETÉ ───────────────────────────────────────────────────────────────
 * Trois états, pas deux : `done` · `todo` · **`unknown`**. Quand la table n'est
 * pas déployée sur l'environnement (outbox_drafts, prosp_* selon le cas) ou que
 * la sonde échoue, l'item est **indéterminé** — JAMAIS « fait », JAMAIS « à
 * faire » : on ne sait pas, et on le dit. Un item `unknown` ne compte ni dans
 * les faits ni dans les restants, et la checklist ne se déclare pas terminée.
 *
 * ── ZÉRO PII / ZÉRO MUTATION ────────────────────────────────────────────────
 * Ce module ne manipule que des identifiants d'items, des états et des
 * compteurs bornés. Aucun nom, aucune adresse, aucun montant. Il ne fait aucun
 * I/O : les sondes vivent dans `checklist-db.ts`, testables séparément.
 */

import type { TourDefinition, TourKey } from "./types";

/* ------------------------------------------------------------------ */
/* Items                                                                */
/* ------------------------------------------------------------------ */

/** Les 7 items, dans l'ordre d'apprentissage (premier client → cockpit). */
export const CHECKLIST_ITEM_IDS = [
  "first-lead",
  "first-property",
  "first-estimation",
  "buyer-criteria",
  "first-match",
  "first-draft",
  "action-center",
] as const;

export type ChecklistItemId = (typeof CHECKLIST_ITEM_IDS)[number];

/**
 * `unknown` n'est PAS un échec silencieux : c'est le seul état honnête quand la
 * table n'existe pas sur cet environnement ou que la lecture a échoué.
 */
export type ChecklistItemState = "done" | "todo" | "unknown";

/** Pourquoi un item est indéterminé. Toujours renvoyé avec `state: "unknown"`. */
export type ChecklistUnknownReason =
  /** Relation absente : migration pas appliquée sur cet environnement. */
  | "schema_missing"
  /** Lecture en erreur (réseau/DB) — on ne devine pas le résultat. */
  | "probe_failed";

export interface ChecklistItem {
  id: ChecklistItemId;
  state: ChecklistItemState;
  /** Compteur borné (`COUNT_CAP`), `null` si indéterminé. Jamais de PII. */
  count: number | null;
  reason?: ChecklistUnknownReason;
}

export interface ChecklistSummary {
  items: ChecklistItem[];
  /** Items réellement faits. */
  done: number;
  /** Items indéterminés (table absente / sonde en erreur). */
  unknown: number;
  total: number;
  /**
   * Vrai UNIQUEMENT si les 7 items sont `done`. Un seul `unknown` suffit à
   * empêcher « terminé » : on ne clôt pas une checklist qu'on n'a pas pu lire.
   */
  completed: boolean;
}

/**
 * Plafond du compteur exposé. On répond à « y en a-t-il ? », pas à « combien
 * exactement » — un volume précis est une information métier inutile ici.
 */
export const COUNT_CAP = 99;

/* ------------------------------------------------------------------ */
/* Sondes → items                                                       */
/* ------------------------------------------------------------------ */

/** Résultat d'une sonde de comptage (produit par `checklist-db.ts`). */
export type ProbeResult =
  | { ok: true; count: number }
  | { ok: false; reason: ChecklistUnknownReason };

/** Compteur borné et normalisé : jamais négatif, jamais au-dessus du plafond. */
export function capCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.floor(count), COUNT_CAP);
}

/**
 * Traduit une sonde en item.
 * `ok: false` → `unknown` + raison. Un échec n'est JAMAIS traduit en `todo`
 * (ce serait affirmer que l'utilisateur n'a rien fait, ce qu'on ignore).
 */
export function itemFromProbe(id: ChecklistItemId, probe: ProbeResult): ChecklistItem {
  if (!probe.ok) return { id, state: "unknown", count: null, reason: probe.reason };
  const count = capCount(probe.count);
  return { id, state: count > 0 ? "done" : "todo", count };
}

/* ------------------------------------------------------------------ */
/* « Consulter le Centre d'actions » — dérivé de la progression du tour  */
/* ------------------------------------------------------------------ */

/** Tour socle qui présente le Centre d'actions. */
export const ACTION_CENTER_TOUR_KEY: TourKey = "core-cockpit";

/** Identifiant de l'étape qui pointe le Centre d'actions dans ce tour. */
export const ACTION_CENTER_STEP_ID = "actionCenter";

/**
 * Index (0-based) de l'étape « Centre d'actions » dans le tour socle.
 * `null` = le tour ne l'expose pas (registre pas encore rempli, étape renommée)
 * → la dérivation se rabat alors sur « tour terminé », jamais sur une devinette.
 */
export function actionCenterStepIndex(def: TourDefinition | null | undefined): number | null {
  if (!def) return null;
  const idx = def.steps.findIndex((s) => s.id === ACTION_CENTER_STEP_ID);
  return idx >= 0 ? idx : null;
}

/** Forme minimale d'une ligne de progression (miroir de `TourProgressView`). */
export interface ProgressLike {
  tour_key: string;
  status: string;
  current_step: number;
}

/** Ce que la progression du tour dit de l'item, côté serveur. */
export type ProgressProbe =
  | { ok: true; entries: readonly ProgressLike[] }
  | { ok: false; reason: ChecklistUnknownReason };

/**
 * L'étape « Centre d'actions » a-t-elle été atteinte ?
 * Vrai si le tour socle est terminé, OU si la progression enregistrée a dépassé
 * (ou atteint) l'index de cette étape.
 */
export function hasSeenActionCenter(
  entries: readonly ProgressLike[],
  stepIndex: number | null,
): boolean {
  return entries.some((e) => {
    if (e.tour_key !== ACTION_CENTER_TOUR_KEY) return false;
    if (e.status === "completed") return true;
    if (stepIndex === null) return false;
    return Number.isFinite(e.current_step) && e.current_step >= stepIndex;
  });
}

/**
 * Item « consulter le Centre d'actions », dérivé de la progression persistée.
 * Progression illisible (table 0059 absente) → `unknown`, jamais « fait ».
 */
export function actionCenterItem(
  probe: ProgressProbe,
  stepIndex: number | null,
): ChecklistItem {
  if (!probe.ok) {
    return { id: "action-center", state: "unknown", count: null, reason: probe.reason };
  }
  const seen = hasSeenActionCenter(probe.entries, stepIndex);
  return { id: "action-center", state: seen ? "done" : "todo", count: seen ? 1 : 0 };
}

/**
 * Réconciliation CLIENT : la progression vit aussi en local (le moteur de visite
 * écrit dans `localStorage`, la table 0059 pouvant ne pas être déployée). Si le
 * navigateur SAIT que le tour socle a été terminé, l'item passe `done` même
 * quand le serveur n'a rien pu lire.
 *
 * Sens unique volontaire : le local peut CONFIRMER un « fait », il ne peut
 * jamais rétrograder un `done` connu du serveur en `todo`.
 */
export function mergeLocalActionCenter(
  item: ChecklistItem,
  localCompleted: boolean,
): ChecklistItem {
  if (item.state === "done" || !localCompleted) return item;
  return { id: item.id, state: "done", count: 1 };
}

/* ------------------------------------------------------------------ */
/* Synthèse                                                             */
/* ------------------------------------------------------------------ */

/** Ordonne les items sur `CHECKLIST_ITEM_IDS` et compte les états. */
export function summarize(items: readonly ChecklistItem[]): ChecklistSummary {
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = CHECKLIST_ITEM_IDS.map(
    (id): ChecklistItem =>
      byId.get(id) ?? { id, state: "unknown", count: null, reason: "probe_failed" },
  );

  const done = ordered.filter((i) => i.state === "done").length;
  const unknown = ordered.filter((i) => i.state === "unknown").length;

  return {
    items: ordered,
    done,
    unknown,
    total: CHECKLIST_ITEM_IDS.length,
    // Un seul item non `done` (y compris indéterminé) → checklist non terminée.
    completed: done === CHECKLIST_ITEM_IDS.length,
  };
}
