/**
 * lib/invest/secondary/index.ts — ⑨ Secondary Market (bulletin board) : services.
 *
 * ADR-007 — anti-matching matérialisé : ce contexte expose PUBLIER / RETIRER une
 * annonce et MANIFESTER un intérêt (mise en relation). Il n'existe AUCUNE fonction
 * de matching / d'exécution automatique. L'exécution réelle = transfert P2P
 * whitelisté via TokenizationPort.canTransfer (gardé compliance si seuil).
 * Opérations DB = stubs typés (Jalon 1).
 */

import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { Listing } from "./types";

export * from "./types";

/** Publie une annonce sur le babillard (pas d'exécution — ADR-007). */
export async function publishListing(_input: { dealId: string; userId: string }): Promise<Listing> {
  const _db = getSupabaseAdmin(); // filtrer user_id + tenant_id (I9)
  throw new NotImplementedError("secondary.publishListing — Jalon 1");
}

/** Liste le babillard (art. 25 ECSP). */
export async function listBoard(_dealId: string): Promise<Listing[]> {
  throw new NotImplementedError("secondary.listBoard — Jalon 1");
}

/** Manifeste un intérêt sur une annonce (mise en relation, PAS d'exécution auto). */
export async function expressInterest(_listingId: string): Promise<void> {
  // ADR-007 — volontairement aucune logique de matching ici.
  throw new NotImplementedError("secondary.expressInterest — Jalon 1");
}
