/**
 * lib/value-evolution/db.ts — LECTURE owner-scopée des estimations pour l'évolution.
 *
 * Toute lecture filtre EXPLICITEMENT tenant_id + user_id : le client PostgREST
 * admin bypass RLS, donc l'owner-check est applicatif et obligatoire. On lit un
 * sous-ensemble réduit de colonnes (aucun secret, aucun PDF/url). Table absente
 * (schéma non migré) → dégradation UNAVAILABLE honnête, jamais de crash.
 */

import type { Database, Gpu1Client } from "@/lib/gpu1";
import { READ_LIMIT } from "@/config/value-evolution";
import { buildSeries, type Thresholds } from "@/lib/value-evolution/detect";
import { isSchemaMissing, type BuildResult, type EstimationRow } from "@/lib/value-evolution/types";

export type ValueEvolutionDbLike = Pick<Gpu1Client<Database>, "from">;

const COLUMNS =
  "id,property_id,owner_lead_id,recommended_price,market_value,property,valued_at,created_at";

/**
 * Lit les estimations du tenant/user et reconstruit les séries d'évolution.
 * Owner-check dur (tenant_id + user_id). Dégrade en UNAVAILABLE si table absente.
 */
export async function loadValueSeries(
  db: ValueEvolutionDbLike,
  tenantId: string,
  userId: string,
  opts: { limit?: number; thresholds?: Thresholds } = {},
): Promise<BuildResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? READ_LIMIT, READ_LIMIT));
  const { data, error } = await db
    .from("estimations")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isSchemaMissing((error as { code?: string }).code)) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "error" };
  }

  const rows = (data ?? []) as unknown as EstimationRow[];
  return { ok: true, series: buildSeries(rows, opts.thresholds) };
}
