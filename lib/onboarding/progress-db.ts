/**
 * lib/onboarding/progress-db.ts — couche DB de la progression des visites guidées.
 *
 * Table : public.user_product_tour_progress (migration 0059, VERSIONNÉE mais pas
 * forcément appliquée sur GPU1). Toute lecture/écriture filtre EXPLICITEMENT
 * tenant_id + user_id : le client PostgREST admin bypasse la RLS, donc
 * l'owner-check est applicatif et obligatoire.
 *
 * ── HONNÊTETÉ DE PERSISTANCE ────────────────────────────────────────────────
 * Tant que 0059 n'est pas appliquée, la relation n'existe pas et PostgREST
 * répond 42P01 / PGRST205 / PGRST202. Dans ce cas ces helpers renvoient
 * `{ ok: false, reason: "unavailable" }` — JAMAIS un succès. Les routes le
 * traduisent en `sync: "unsynced"` + `persisted: false` : la visite reste
 * jouable pour la session courante, mais rien ne prétend avoir été enregistré.
 *
 * ── ZÉRO PII ────────────────────────────────────────────────────────────────
 * Seules des clés de tour (slugs), des compteurs et des horodatages transitent.
 * Aucun texte libre n'est lu ni écrit ici.
 */

import type { Gpu1Client, Database } from "@/lib/gpu1";

/** Nom de la relation PostgREST (absente des types générés tant que 0059 n'est pas appliquée). */
const TABLE = "user_product_tour_progress";

/** Colonnes exposées au client. Ni tenant_id ni user_id ne sortent (imposés serveur). */
const VIEW_COLUMNS =
  "tour_key,tour_version,status,current_step,started_at,completed_at,dismissed_at,last_seen_at,updated_at";

/** Statuts admis — miroir exact du CHECK SQL de 0059. */
export const TOUR_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "dismissed",
] as const;
export type TourProgressStatus = (typeof TOUR_PROGRESS_STATUSES)[number];

/** Format d'une clé de tour — miroir exact du CHECK SQL (interdit structurellement la PII). */
export const TOUR_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Bornes miroir des CHECK SQL. */
export const TOUR_STEP_MAX = 500;
export const TOUR_VERSION_MAX = 9999;

/**
 * État de synchronisation exposé au consommateur (moteur de tour côté client).
 * `synced`   : la progression est réellement en base.
 * `unsynced` : la table n'existe pas encore (0059 non appliquée) — rien n'est
 *              persisté, et on le DIT. Jamais un faux succès.
 */
export type ProgressSyncState = "synced" | "unsynced";

/** Vue renvoyée par l'API. Aucune colonne d'identité ni de PII. */
export interface TourProgressView {
  tour_key: string;
  tour_version: number;
  status: TourProgressStatus;
  current_step: number;
  started_at: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  last_seen_at: string | null;
  updated_at: string;
}

/**
 * Codes PostgREST/Postgres « relation ou colonne absente » → migration 0059 pas
 * (encore) appliquée. 42P01 = relation inexistante, 42703 = colonne inexistante,
 * PGRST205/PGRST202 = table/fonction absente du cache de schéma PostgREST.
 */
export const TOUR_PROGRESS_MISSING_CODES = [
  "42P01",
  "42703",
  "PGRST205",
  "PGRST202",
] as const;

export function isTourProgressSchemaMissing(code: string | undefined | null): boolean {
  return (TOUR_PROGRESS_MISSING_CODES as readonly string[]).includes(String(code ?? ""));
}

/** Raison stable renvoyée au client quand la table n'est pas déployée. */
export const TOUR_PROGRESS_UNAVAILABLE_REASON = "tour_progress_schema_missing";

export type ProgressDbLike = Pick<Gpu1Client<Database>, "from">;

/** Le client typé ne connaît pas encore la table (types gpu1 désynchronisés) → cast contrôlé. */
function tbl(db: ProgressDbLike) {
  return (
    db as unknown as { from: (name: string) => ReturnType<ProgressDbLike["from"]> }
  ).from(TABLE);
}

export type ReadResult =
  | { ok: true; entries: TourProgressView[] }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error" };

export type WriteResult =
  | { ok: true; entry: TourProgressView }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error" };

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error" };

function classify(error: unknown): "unavailable" | "error" {
  return isTourProgressSchemaMissing((error as { code?: string } | null)?.code)
    ? "unavailable"
    : "error";
}

/**
 * Progression owner-scopée de l'utilisateur courant.
 * `tenantId` / `userId` viennent TOUJOURS des claims serveur — jamais du client.
 */
export async function readProgress(
  db: ProgressDbLike,
  tenantId: string,
  userId: string,
  opts: { tourKey?: string } = {},
): Promise<ReadResult> {
  let q = tbl(db)
    .select(VIEW_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (opts.tourKey) q = q.eq("tour_key", opts.tourKey);

  const { data, error } = await q;
  if (error) return { ok: false, reason: classify(error) };
  return { ok: true, entries: (data ?? []) as unknown as TourProgressView[] };
}

/**
 * Upsert de la progression sur la contrainte UNIQUE
 * (tenant_id, user_id, tour_key, tour_version).
 *
 * `tenantId` / `userId` sont injectés ICI depuis les claims : l'appelant ne
 * peut pas les fournir via `input`. Les horodatages de cycle de vie sont
 * stampés par le trigger DB, jamais acceptés depuis le réseau.
 */
export async function upsertProgress(
  db: ProgressDbLike,
  tenantId: string,
  userId: string,
  input: {
    tourKey: string;
    tourVersion: number;
    status: TourProgressStatus;
    currentStep: number;
  },
): Promise<WriteResult> {
  const { data, error } = await tbl(db)
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        tour_key: input.tourKey,
        tour_version: input.tourVersion,
        status: input.status,
        current_step: input.currentStep,
      },
      { onConflict: "tenant_id,user_id,tour_key,tour_version" },
    )
    .select(VIEW_COLUMNS)
    .single();

  if (error) return { ok: false, reason: classify(error) };
  return { ok: true, entry: data as unknown as TourProgressView };
}

/**
 * Reset owner-scopé : supprime la progression pour permettre de REJOUER la
 * visite. Borné au tenant + user courants ; `tourKey` restreint encore.
 */
export async function resetProgress(
  db: ProgressDbLike,
  tenantId: string,
  userId: string,
  opts: { tourKey?: string; tourVersion?: number } = {},
): Promise<ResetResult> {
  let q = tbl(db).delete().eq("tenant_id", tenantId).eq("user_id", userId);
  if (opts.tourKey) q = q.eq("tour_key", opts.tourKey);
  if (opts.tourVersion != null) q = q.eq("tour_version", opts.tourVersion);

  const { error } = await q;
  if (error) return { ok: false, reason: classify(error) };
  return { ok: true };
}
