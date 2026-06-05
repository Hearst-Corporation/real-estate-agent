/**
 * lib/invest/distribution/index.ts — ⑦ Distribution & Lifecycle : services.
 *
 * N'exécute PAS le virement (délègue à ⑤). Le calcul du waterfall réutilise le
 * MOTEUR FINANCIER pur (lib/invest/finance) — pas de réimplémentation ici.
 * Opérations DB / payouts = stubs typés (Jalon 1).
 */

import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { Distribution, Payout } from "./types";

export * from "./types";

/** Calcule la cascade de distribution à l'exit (hook moteur financier → ⑤ exécute). */
export async function runWaterfall(_dealId: string): Promise<Distribution> {
  const _db = getSupabaseAdmin(); // filtrer tenant_id (I9)
  throw new NotImplementedError("distribution.runWaterfall — Jalon 1 (cf. lib/invest/finance)");
}

/** Liste les payouts reçus par l'investisseur (coupons/exit). */
export async function listPayouts(_userId: string): Promise<Payout[]> {
  throw new NotImplementedError("distribution.listPayouts — Jalon 1");
}

/** Ajoute un jalon travaux (photos, LTV, avancement). */
export async function addMilestone(_input: { dealId: string }): Promise<void> {
  throw new NotImplementedError("distribution.addMilestone — Jalon 1");
}
