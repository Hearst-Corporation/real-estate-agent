/**
 * lib/invest/ledger/index.ts — ④ Securities Ledger (DEEP) : services.
 *
 * I1 : SOURCE DE VÉRITÉ. N'appelle JAMAIS la chaîne directement — émet des events
 * que ⑥ consomme. I10 : registre append-only hash-chaîné (le calcul du hash est
 * fait côté base par trigger plpgsql `inv-ledger-hashchain` — §3.3 ; côté domaine
 * on fournit le vérificateur d'intégrité pur).
 *
 * Opérations DB = stubs typés (Jalon 1).
 */

import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { LedgerEntry, Holding } from "./types";

export * from "./types";

/**
 * Vérifie PUREMENT l'intégrité de la chaîne de hash d'un registre (I10).
 * Recalcule la continuité prev_hash → entry_hash ; toute rupture = altération.
 * (Le calcul du hash lui-même reste côté DB ; ici on valide la continuité des
 * liens, qui suffit à détecter une insertion/suppression rétroactive.)
 */
export function verifyHashChain(entries: readonly LedgerEntry[]): boolean {
  let prev: string | null = null;
  for (const e of entries) {
    if (e.prevHash !== prev) return false; // I10 — maillon rompu
    prev = e.entryHash;
  }
  return true;
}

/** Inscrit un mouvement en DEEP (source de vérité, AVANT tout mint — I1). */
export async function inscribeDeep(_input: {
  dealId: string;
  holderWallet: string;
  units: number;
}): Promise<LedgerEntry> {
  const _db = getSupabaseAdmin(); // filtrer tenant_id (I9)
  throw new NotImplementedError("ledger.inscribeDeep — Jalon 1");
}

/** Cap table off-chain (état agrégé, source de vérité opposable). */
export async function getHoldings(_dealId: string): Promise<Holding[]> {
  throw new NotImplementedError("ledger.getHoldings — Jalon 1");
}

/** Journal append-only (audit). */
export async function getEntries(_dealId: string): Promise<LedgerEntry[]> {
  throw new NotImplementedError("ledger.getEntries — Jalon 1");
}
