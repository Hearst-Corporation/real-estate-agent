/**
 * lib/onboarding/checklist-db.ts — SONDES de la checklist de démarrage (W6).
 * =================================================================
 *
 * LECTURE SEULE, STRICTEMENT. Ce module ne connaît que `select` : aucun
 * `insert`, `update`, `upsert`, `delete`, aucun RPC. La checklist observe l'état
 * réel du compte, elle ne le modifie jamais.
 *
 * ── OWNER-CHECK APPLICATIF ──────────────────────────────────────────────────
 * Le client PostgREST admin bypasse la RLS : chaque sonde filtre donc
 * EXPLICITEMENT `tenant_id` + `user_id`, tous deux issus des claims serveur.
 *
 * ── REQUÊTES BORNÉES, ZÉRO PII ──────────────────────────────────────────────
 * Jamais de `select *`. Chaque sonde est un comptage `head: true` (aucune ligne
 * ramenée) borné par `.limit(1)` : on répond à « y en a-t-il ? », on ne rapatrie
 * ni nom, ni adresse, ni montant. Seul un entier remonte.
 *
 * ── DÉGRADATION HONNÊTE ─────────────────────────────────────────────────────
 * `outbox_drafts` et les tables `prosp_*` peuvent être ABSENTES selon
 * l'environnement. Détection via `lib/db/schema-missing.ts` (source canonique)
 * → l'item devient `unknown` / `schema_missing`, JAMAIS « fait », JAMAIS « à
 * faire ». Une sonde absente ne fait pas échouer les six autres.
 */

import type { Gpu1Client, Database } from "@/lib/gpu1";
import { isSchemaOrTableMissing } from "@/lib/db/schema-missing";
import { readProgress, type ReadResult } from "@/lib/onboarding/progress-db";
import {
  ACTION_CENTER_TOUR_KEY,
  actionCenterItem,
  actionCenterStepIndex,
  itemFromProbe,
  summarize,
  type ChecklistItem,
  type ChecklistItemId,
  type ChecklistSummary,
  type ProbeResult,
  type ProgressLike,
  type ProgressProbe,
} from "@/lib/onboarding/checklist";
import { getTour } from "@/lib/onboarding/tours";

export type ChecklistDbLike = Pick<Gpu1Client<Database>, "from">;

/**
 * Source réelle de chaque item dérivé en base. Le 7ᵉ item (`action-center`) est
 * absent : il n'a aucune trace métier et se dérive de la progression du tour.
 *
 * `activeOnly` : le critère acquéreur ne compte que s'il est ACTIF — un critère
 * archivé ne prouve pas que l'utilisateur en a un en service.
 */
export const CHECKLIST_SOURCES = {
  "first-lead": { table: "leads" },
  "first-property": { table: "properties" },
  "first-estimation": { table: "estimations" },
  "buyer-criteria": { table: "prosp_criteres_acquereur", activeOnly: true },
  "first-match": { table: "prosp_matchs" },
  "first-draft": { table: "outbox_drafts" },
} as const satisfies Partial<Record<ChecklistItemId, { table: string; activeOnly?: boolean }>>;

/** Items dérivés d'un comptage en base, dans l'ordre d'affichage. */
export const DB_DERIVED_ITEM_IDS = Object.keys(CHECKLIST_SOURCES) as Array<
  keyof typeof CHECKLIST_SOURCES
>;

/**
 * `outbox_drafts` est absent des types générés (comme la table 0059) → accès par
 * nom via un cast contrôlé, exactement comme `progress-db.ts`.
 */
function tbl(db: ChecklistDbLike, name: string) {
  return (
    db as unknown as { from: (n: string) => ReturnType<ChecklistDbLike["from"]> }
  ).from(name);
}

/**
 * Sonde d'EXISTENCE owner-scopée : `head: true` (zéro ligne ramenée) +
 * `count: "exact"` + `.limit(1)`. Aucune colonne métier n'est sélectionnée.
 */
async function probeCount(
  db: ChecklistDbLike,
  tenantId: string,
  userId: string,
  source: { table: string; activeOnly?: boolean },
): Promise<ProbeResult> {
  try {
    let q = tbl(db, source.table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .limit(1);

    if (source.activeOnly) q = q.eq("actif", true);

    const { count, error } = await q;
    if (error) {
      return {
        ok: false,
        reason: isSchemaOrTableMissing(error as { code?: string }) ? "schema_missing" : "probe_failed",
      };
    }
    return { ok: true, count: typeof count === "number" ? count : 0 };
  } catch {
    // Le client PostgREST peut jeter (réseau, URL absente) → indéterminé, pas 500.
    return { ok: false, reason: "probe_failed" };
  }
}

/** Traduit le résultat de `readProgress` dans le vocabulaire de la checklist. */
export function progressProbeFrom(res: ReadResult): ProgressProbe {
  if (res.ok) return { ok: true, entries: res.entries as readonly ProgressLike[] };
  return { ok: false, reason: res.reason === "unavailable" ? "schema_missing" : "probe_failed" };
}

/**
 * Checklist complète pour l'utilisateur courant.
 * `tenantId` / `userId` viennent TOUJOURS des claims serveur — jamais du client.
 *
 * Les sept sondes sont indépendantes : une table absente n'invalide que SON
 * item. Aucune ne peut muter quoi que ce soit.
 */
export async function buildChecklist(
  db: ChecklistDbLike,
  tenantId: string,
  userId: string,
): Promise<ChecklistSummary> {
  const [dbItems, progressRes] = await Promise.all([
    Promise.all(
      DB_DERIVED_ITEM_IDS.map(
        async (id): Promise<ChecklistItem> =>
          itemFromProbe(id, await probeCount(db, tenantId, userId, CHECKLIST_SOURCES[id])),
      ),
    ),
    readProgress(db, tenantId, userId, { tourKey: ACTION_CENTER_TOUR_KEY }),
  ]);

  const stepIndex = actionCenterStepIndex(getTour(ACTION_CENTER_TOUR_KEY));
  return summarize([...dbItems, actionCenterItem(progressProbeFrom(progressRes), stepIndex)]);
}
