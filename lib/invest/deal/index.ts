/**
 * lib/invest/deal/index.ts — ② Deal & Offering : services.
 *
 * Ne crée PAS de souscription et ne fait AUCUN matching automatique d'investisseurs
 * (I3 : pas de moteur d'allocation). Cycle de vie du deal + publication (gardée
 * compliance : KIIS validé). Opérations DB = stubs typés (Jalon 1).
 */

import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { Deal } from "./types";

export * from "./types";

/** Crée un deal + son SPV dédié (back-office opérateur). */
export async function createDeal(_input: { spvId: string; slug: string }): Promise<Deal> {
  const _db = getSupabaseAdmin(); // filtrer tenant_id explicitement (I9)
  throw new NotImplementedError("deal.createDeal — Jalon 1");
}

/** Liste les deals ouverts. AUCUNE allocation/sélection auto (I3). */
export async function listOpenDeals(): Promise<Deal[]> {
  throw new NotImplementedError("deal.listOpenDeals — Jalon 1");
}

/** Passe le deal en `open` (garde compliance : KIIS publié). */
export async function publishDeal(_dealId: string): Promise<void> {
  throw new NotImplementedError("deal.publishDeal — Jalon 1");
}
