/**
 * lib/invest/tokenization/index.ts — ⑥ Tokenization (MIROIR) : services.
 *
 * N'est JAMAIS source de vérité (I1) : suit le Ledger (④). Implémente PUREMENT
 * la règle d'or de réconciliation (§5.2, DEEP gagne toujours) ; le mint/burn et
 * les lectures chaîne passent par les ports et restent stubs (Jalon 1).
 */

import { NotImplementedError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { TokenMint, ReconciliationResult } from "./types";

export * from "./types";

/**
 * Règle d'or PURE de réconciliation DEEP↔chaîne (§5.2).
 * DEEP (expected) gagne TOUJOURS :
 *  - chaîne == DEEP            → in_sync
 *  - chaîne <  DEEP            → mint_missing (ré-émettre le mint, idempotent)
 *  - chaîne >  DEEP            → chain_exceeds_deep (ANOMALIE → pause + escalade)
 */
export function reconcileWallet(input: {
  expectedUnits: number; // SUM(inv_holdings) — source de vérité I1
  onchainUnits: number; // balance ERC-3643
}): ReconciliationResult {
  if (input.onchainUnits === input.expectedUnits) return "in_sync";
  if (input.onchainUnits < input.expectedUnits) return "mint_missing";
  return "chain_exceeds_deep"; // I1 — on ne « régularise » jamais DEEP sur la chaîne
}

/** Mint le miroir on-chain APRÈS inscription DEEP (délègue TokenizationPort). I1. */
export async function mintMirror(_input: { dealId: string; subscriptionId: string }): Promise<TokenMint> {
  const _db = getSupabaseAdmin(); // filtrer tenant_id (I9)
  throw new NotImplementedError("tokenization.mintMirror — Jalon 1");
}

/** Lance une passe de réconciliation pour un deal (saga inv-reconcile). */
export async function runReconciliation(_dealId: string): Promise<void> {
  throw new NotImplementedError("tokenization.runReconciliation — Jalon 1");
}
