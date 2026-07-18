/**
 * Product tour — logique de progression PURE (REA-ONBOARDING-011, LOT 1).
 * =================================================================
 *
 * Zéro DOM, zéro React, zéro `window` : tout est testable en Node.
 * Le provider (components/onboarding/ProductTourProvider.tsx) se contente
 * d'appliquer ces transitions et de les persister.
 *
 * Invariants garantis ici :
 *   - `stepIndex` reste toujours dans les bornes du tour ;
 *   - une reprise dont la `version` a changé repart de l'étape 1 ;
 *   - une visite terminée/passée ne se reprend pas toute seule ;
 *   - une cible absente ne bloque JAMAIS : on saute ou on centre.
 */

import type {
  MissingAnchorStrategy,
  TourDefinition,
  TourKey,
  TourProgress,
  TourStep,
} from "./types";

/** Stratégie par défaut quand `step.onMissing` n'est pas précisé. */
export const DEFAULT_MISSING_STRATEGY: MissingAnchorStrategy = "center";

/** Attente par défaut d'une ancre chargée en asynchrone (ms). */
export const DEFAULT_ANCHOR_WAIT_MS = 4000;

/** Marge par défaut de la découpe autour de la cible (px). */
export const SPOTLIGHT_PADDING = 8;

/** Préfixe des clés de persistance locale. */
export const PROGRESS_STORAGE_PREFIX = "azigo.tour";

/** Clé de stockage d'une visite. */
export function storageKey(key: TourKey): string {
  return `${PROGRESS_STORAGE_PREFIX}.${key}`;
}

/* ------------------------------------------------------------------ */
/* Lecture d'un tour                                                    */
/* ------------------------------------------------------------------ */

/** Nombre d'étapes (0 si le tour est vide). */
export function stepCount(def: TourDefinition): number {
  return def.steps.length;
}

/** Borne un index dans `[0, steps.length - 1]` (0 si le tour est vide). */
export function clampIndex(def: TourDefinition, index: number): number {
  if (def.steps.length === 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const i = Math.trunc(index);
  if (i < 0) return 0;
  if (i > def.steps.length - 1) return def.steps.length - 1;
  return i;
}

/** Étape à un index, ou `null` si hors bornes. */
export function stepAt(def: TourDefinition, index: number): TourStep | null {
  return def.steps[index] ?? null;
}

export function isFirstStep(index: number): boolean {
  return index <= 0;
}

export function isLastStep(def: TourDefinition, index: number): boolean {
  return def.steps.length === 0 || index >= def.steps.length - 1;
}

/** Libellé « Étape X sur Y » (1-based pour l'affichage). */
export function stepPosition(
  def: TourDefinition,
  index: number,
): { current: number; total: number } {
  return { current: clampIndex(def, index) + 1, total: def.steps.length };
}

/** Stratégie effective d'une étape face à une cible absente. */
export function missingStrategy(step: TourStep): MissingAnchorStrategy {
  return step.onMissing ?? DEFAULT_MISSING_STRATEGY;
}

/** Attente effective de l'ancre pour une étape. */
export function anchorWaitMs(step: TourStep): number {
  return step.waitMs ?? DEFAULT_ANCHOR_WAIT_MS;
}

/** Marge effective de découpe pour une étape. */
export function spotlightPadding(step: TourStep): number {
  return step.padding ?? SPOTLIGHT_PADDING;
}

/* ------------------------------------------------------------------ */
/* Transitions                                                          */
/* ------------------------------------------------------------------ */

function touch(progress: TourProgress, now: number): TourProgress {
  return { ...progress, updatedAt: now };
}

/** État initial d'une visite : étape 1, statut `running`. */
export function startProgress(def: TourDefinition, now: number = Date.now()): TourProgress {
  return {
    key: def.key,
    version: def.version,
    stepIndex: 0,
    status: "running",
    updatedAt: now,
  };
}

/**
 * Étape suivante. Sur la dernière étape, la visite est `completed`
 * (l'index reste sur la dernière étape, jamais hors bornes).
 */
export function nextProgress(
  def: TourDefinition,
  progress: TourProgress,
  now: number = Date.now(),
): TourProgress {
  const index = clampIndex(def, progress.stepIndex);
  if (isLastStep(def, index)) {
    return touch({ ...progress, stepIndex: index, status: "completed" }, now);
  }
  return touch({ ...progress, stepIndex: index + 1, status: "running" }, now);
}

/** Retour arrière. Sur la première étape, on reste sur la première. */
export function prevProgress(
  def: TourDefinition,
  progress: TourProgress,
  now: number = Date.now(),
): TourProgress {
  const index = clampIndex(def, progress.stepIndex);
  return touch({ ...progress, stepIndex: Math.max(0, index - 1), status: "running" }, now);
}

/** Saut direct à une étape (ex. cible absente → étape suivante utile). */
export function goToProgress(
  def: TourDefinition,
  progress: TourProgress,
  index: number,
  now: number = Date.now(),
): TourProgress {
  return touch({ ...progress, stepIndex: clampIndex(def, index), status: "running" }, now);
}

/** Abandon volontaire (« Passer », Échap). */
export function skipProgress(progress: TourProgress, now: number = Date.now()): TourProgress {
  return touch({ ...progress, status: "skipped" }, now);
}

/** Fin normale (bouton « Terminer »). */
export function completeProgress(
  def: TourDefinition,
  progress: TourProgress,
  now: number = Date.now(),
): TourProgress {
  return touch(
    { ...progress, stepIndex: clampIndex(def, progress.stepIndex), status: "completed" },
    now,
  );
}

/* ------------------------------------------------------------------ */
/* Cible absente — on saute, on ne bloque jamais                        */
/* ------------------------------------------------------------------ */

/**
 * Cherche, depuis `from` inclus et dans la direction `direction`, la première
 * étape RENDABLE. Une étape est rendable si :
 *   - elle n'a pas d'ancre (explicative), OU
 *   - son ancre est présente, OU
 *   - sa stratégie d'absence est `center` (on affiche l'explication au centre).
 * Seules les étapes `onMissing: "skip"` dont l'ancre manque sont sautées.
 *
 * Retourne `null` si aucune étape rendable dans cette direction — l'appelant
 * termine alors la visite proprement plutôt que de bloquer l'interface.
 */
export function seekRenderableStep(
  def: TourDefinition,
  from: number,
  direction: 1 | -1,
  isAnchorPresent: (anchor: string) => boolean,
): number | null {
  for (let i = from; i >= 0 && i < def.steps.length; i += direction) {
    const step = def.steps[i];
    if (!step) break;
    if (isStepRenderable(step, isAnchorPresent)) return i;
  }
  return null;
}

/** Une étape est-elle affichable en l'état du DOM ? */
export function isStepRenderable(
  step: TourStep,
  isAnchorPresent: (anchor: string) => boolean,
): boolean {
  if (!step.anchor) return true;
  if (isAnchorPresent(step.anchor)) return true;
  return missingStrategy(step) === "center";
}

/* ------------------------------------------------------------------ */
/* Persistance / reprise                                                */
/* ------------------------------------------------------------------ */

const STATUSES = new Set(["idle", "running", "completed", "skipped"]);

/** Sérialisation stable pour le stockage local. */
export function serializeProgress(progress: TourProgress): string {
  return JSON.stringify(progress);
}

/**
 * Désérialisation DÉFENSIVE : toute donnée corrompue ou d'un autre schéma
 * renvoie `null` (on repart proprement plutôt que de planter l'UI).
 */
export function parseProgress(raw: string | null | undefined): TourProgress | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (typeof candidate.key !== "string") return null;
  if (typeof candidate.version !== "number" || !Number.isFinite(candidate.version)) return null;
  if (typeof candidate.stepIndex !== "number" || !Number.isFinite(candidate.stepIndex)) return null;
  if (typeof candidate.status !== "string" || !STATUSES.has(candidate.status)) return null;
  return {
    key: candidate.key as TourKey,
    version: candidate.version,
    stepIndex: Math.max(0, Math.trunc(candidate.stepIndex)),
    status: candidate.status as TourProgress["status"],
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
  };
}

/**
 * Reprise après rechargement.
 * - rien de stocké, mauvaise clé, version obsolète, ou visite déjà
 *   terminée/passée → `null` (pas de reprise automatique) ;
 * - visite `running` → on reprend à l'étape stockée, bornée au tour.
 */
export function resumeProgress(
  def: TourDefinition,
  stored: TourProgress | null,
  now: number = Date.now(),
): TourProgress | null {
  if (!stored) return null;
  if (stored.key !== def.key) return null;
  if (stored.version !== def.version) return null;
  if (stored.status !== "running") return null;
  if (def.steps.length === 0) return null;
  return { ...stored, stepIndex: clampIndex(def, stored.stepIndex), updatedAt: now };
}

/** Statut exploitable d'un état stocké (version obsolète → `idle`). */
export function statusFromStored(
  def: TourDefinition,
  stored: TourProgress | null,
): TourProgress["status"] {
  if (!stored || stored.key !== def.key) return "idle";
  if (stored.version !== def.version) return "idle";
  return stored.status;
}

/* ------------------------------------------------------------------ */
/* Validation d'une définition (garde-fou pour les tours des workers)   */
/* ------------------------------------------------------------------ */

/**
 * Vérifie qu'un tour est exploitable. Retourne la liste des problèmes
 * (vide = tour valide). Utilisé par `defineTour()` et par les tests.
 */
export function validateTour(def: TourDefinition): string[] {
  const problems: string[] = [];
  if (!def.key) problems.push("clé de tour manquante");
  if (!Number.isInteger(def.version) || def.version < 1) {
    problems.push(`version invalide pour « ${def.key} » (entier >= 1 attendu)`);
  }
  if (def.steps.length === 0) problems.push(`tour « ${def.key} » sans étape`);
  const seen = new Set<string>();
  for (const step of def.steps) {
    if (!step.id) {
      problems.push(`étape sans id dans « ${def.key} »`);
      continue;
    }
    if (seen.has(step.id)) problems.push(`id d'étape dupliqué : ${def.key}/${step.id}`);
    seen.add(step.id);
    if (!step.title || !step.body) {
      problems.push(`étape ${def.key}/${step.id} : titre et explication obligatoires`);
    }
  }
  return problems;
}
