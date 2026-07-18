/**
 * lib/onboarding/progress-client.ts — accès navigateur à la progression du tour.
 *
 * Consommé par le moteur de visite guidée (W1). Ne connaît NI la DB NI les
 * secrets : il ne fait que parler à /api/onboarding/*, qui impose lui-même
 * tenant_id + user_id depuis la session. Aucun identifiant d'utilisateur ou de
 * tenant n'est jamais envoyé d'ici — les routes les refuseraient (Zod strict).
 *
 * ── CONTRAT D'HONNÊTETÉ ─────────────────────────────────────────────────────
 * Chaque retour porte un `sync` :
 *   "synced"   → la progression est RÉELLEMENT en base.
 *   "unsynced" → rien n'a été persisté (migration 0059 non appliquée, session
 *                expirée, DB non configurée, réseau KO). Le moteur DOIT alors
 *                fonctionner en mémoire pour la session courante ET l'afficher.
 * Aucun chemin ne renvoie "synced" sans écriture serveur confirmée.
 */

import type {
  ProgressSyncState,
  TourProgressStatus,
  TourProgressView,
} from "@/lib/onboarding/progress-db";

export type { ProgressSyncState, TourProgressStatus, TourProgressView };

/** Pourquoi la progression n'est pas synchronisée — jamais masqué à l'appelant. */
export type ProgressUnsyncedReason =
  | "tour_progress_schema_missing" // migration 0059 pas encore appliquée
  | "unauthorized" // session absente/expirée
  | "database_not_configured" // env DB absent côté serveur
  | "bad_request" // payload refusé par la validation serveur
  | "server_error" // 500 générique
  | "network_error"; // fetch impossible / réponse illisible

export interface ProgressReadOutcome {
  sync: ProgressSyncState;
  entries: TourProgressView[];
  reason?: ProgressUnsyncedReason;
}

export interface ProgressWriteOutcome {
  sync: ProgressSyncState;
  entry: TourProgressView | null;
  reason?: ProgressUnsyncedReason;
}

export interface ProgressResetOutcome {
  sync: ProgressSyncState;
  cleared: boolean;
  reason?: ProgressUnsyncedReason;
}

const PROGRESS_URL = "/api/onboarding/progress";
const RESET_URL = "/api/onboarding/reset";

/** Traduit un statut HTTP d'échec en raison stable, sans jamais inventer un succès. */
function reasonFromStatus(status: number, payloadReason?: unknown): ProgressUnsyncedReason {
  if (typeof payloadReason === "string" && payloadReason === "tour_progress_schema_missing") {
    return "tour_progress_schema_missing";
  }
  if (status === 401) return "unauthorized";
  if (status === 400) return "bad_request";
  if (status === 503) return "database_not_configured";
  return "server_error";
}

type RawResponse = {
  sync?: unknown;
  persisted?: unknown;
  reason?: unknown;
  entries?: unknown;
  entry?: unknown;
  cleared?: unknown;
  error?: unknown;
};

async function readJson(res: Response): Promise<RawResponse | null> {
  try {
    return (await res.json()) as RawResponse;
  } catch {
    return null;
  }
}

/**
 * `synced` UNIQUEMENT si le serveur confirme explicitement `persisted === true`
 * ET `sync === "synced"`. Toute autre forme (champ absent, valeur inattendue)
 * est traitée comme non synchronisée — on ne suppose jamais le succès.
 */
function isServerConfirmedSync(body: RawResponse | null): boolean {
  return body?.sync === "synced" && body?.persisted === true;
}

/** Lit la progression de l'utilisateur courant (option : un seul tour). */
export async function fetchTourProgress(tourKey?: string): Promise<ProgressReadOutcome> {
  const url = tourKey ? `${PROGRESS_URL}?tour_key=${encodeURIComponent(tourKey)}` : PROGRESS_URL;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" });
  } catch {
    return { sync: "unsynced", entries: [], reason: "network_error" };
  }

  const body = await readJson(res);
  if (!res.ok) {
    return { sync: "unsynced", entries: [], reason: reasonFromStatus(res.status, body?.reason) };
  }
  if (!isServerConfirmedSync(body)) {
    return {
      sync: "unsynced",
      entries: [],
      reason: reasonFromStatus(res.status, body?.reason),
    };
  }
  return {
    sync: "synced",
    entries: Array.isArray(body?.entries) ? (body.entries as TourProgressView[]) : [],
  };
}

/** Enregistre la progression. `sync: "unsynced"` = RIEN n'a été persisté. */
export async function saveTourProgress(input: {
  tourKey: string;
  tourVersion?: number;
  status: TourProgressStatus;
  currentStep: number;
}): Promise<ProgressWriteOutcome> {
  let res: Response;
  try {
    res = await fetch(PROGRESS_URL, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tour_key: input.tourKey,
        ...(input.tourVersion != null ? { tour_version: input.tourVersion } : {}),
        status: input.status,
        current_step: input.currentStep,
      }),
    });
  } catch {
    return { sync: "unsynced", entry: null, reason: "network_error" };
  }

  const body = await readJson(res);
  if (!res.ok || !isServerConfirmedSync(body)) {
    return { sync: "unsynced", entry: null, reason: reasonFromStatus(res.status, body?.reason) };
  }
  return { sync: "synced", entry: (body?.entry ?? null) as TourProgressView | null };
}

/** Réinitialise un tour pour le rejouer. `cleared: false` = rien n'a été effacé en base. */
export async function resetTourProgress(input: {
  tourKey: string;
  tourVersion?: number;
}): Promise<ProgressResetOutcome> {
  let res: Response;
  try {
    res = await fetch(RESET_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tour_key: input.tourKey,
        ...(input.tourVersion != null ? { tour_version: input.tourVersion } : {}),
      }),
    });
  } catch {
    return { sync: "unsynced", cleared: false, reason: "network_error" };
  }

  const body = await readJson(res);
  if (!res.ok || !isServerConfirmedSync(body)) {
    return { sync: "unsynced", cleared: false, reason: reasonFromStatus(res.status, body?.reason) };
  }
  return { sync: "synced", cleared: body?.cleared === true };
}
