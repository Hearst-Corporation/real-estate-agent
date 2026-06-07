/**
 * lib/invest/compliance/index.ts — ⑧ Compliance & Reporting : services.
 *
 * Implémente PUREMENT la règle 4-eyes (deux approbateurs distincts — §6.3) et le
 * mapping screening → blocage explicite. Les opérations DB / écritures d'audit
 * sont des stubs typés (Jalon 1). Jamais de blocage silencieux.
 */

import { NotImplementedError, ComplianceBlockedError } from "../shared/errors";
import type { Result } from "../shared/types";
import { ok, err } from "../shared/types";
import { getSupabaseAdmin } from "../../server/supabase";
import type { Approval, ScreeningResult } from "./types";

export * from "./types";

/**
 * Valide PUREMENT une règle 4-eyes : deux approbateurs présents ET DISTINCTS
 * (cf. CHECK inv_approvals : approver_1 <> approver_2). §6.3.
 */
export function validateFourEyes(input: {
  approver1: string | null;
  approver2: string | null;
}): Result<true, string> {
  if (!input.approver1 || !input.approver2) return err("4-eyes : deux approbateurs requis");
  if (input.approver1 === input.approver2) return err("4-eyes : approbateurs identiques interdits");
  return ok(true);
}

/**
 * Traduit PUREMENT un résultat de screening en décision de blocage EXPLICITE.
 * sanctions/mixer ⇒ ComplianceBlockedError (jamais avalé) ; clean ⇒ ok.
 */
export function assertScreeningClean(result: ScreeningResult): void {
  if (result === "sanctions") throw new ComplianceBlockedError("hit sanctions (LCB-FT)");
  if (result === "mixer") throw new ComplianceBlockedError("exposition mixer (LCB-FT)");
}

/** File d'attente des checks LCB-FT / escalades (DB). */
export async function listComplianceCases(): Promise<Approval[]> {
  const _db = getSupabaseAdmin(); // filtrer tenant_id (I9)
  throw new NotImplementedError("compliance.listComplianceCases — Jalon 1");
}

/** Enregistre une décision compliance (approve/reject/edd) + audit trail. */
export async function decideCase(_input: { caseId: string }): Promise<void> {
  throw new NotImplementedError("compliance.decideCase — Jalon 1");
}
