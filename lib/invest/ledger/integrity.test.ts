/**
 * lib/invest/ledger/integrity.test.ts — ④ vérif hash-chain (PUR, I10).
 * lib/invest/tokenization/reconcile.test.ts couvre §5.2 (cf. fichier dédié).
 */

import { describe, it, expect } from "vitest";
import { verifyHashChain } from "./index";
import type { LedgerEntry } from "./types";

function entry(prevHash: string | null, entryHash: string): LedgerEntry {
  return {
    id: entryHash,
    tenantId: "real-estate-agent",
    dealId: "d1",
    entryType: "issuance",
    units: 1,
    nominalEur: 100_000,
    balanceUnitsAfter: 1,
    deepRegisterRef: "deep-1",
    reconciliationStatus: "legal_only",
    prevHash,
    entryHash,
  };
}

describe("verifyHashChain (I10)", () => {
  it("chaîne intacte (genesis prev=null puis liens continus)", () => {
    const chain = [entry(null, "h1"), entry("h1", "h2"), entry("h2", "h3")];
    expect(verifyHashChain(chain)).toBe(true);
  });

  it("chaîne vide est valide", () => {
    expect(verifyHashChain([])).toBe(true);
  });

  it("maillon rompu (entrée retirée) → détecté", () => {
    const broken = [entry(null, "h1"), entry("h2", "h3")]; // h2 manquant
    expect(verifyHashChain(broken)).toBe(false);
  });

  it("genesis altéré (prev non null) → détecté", () => {
    expect(verifyHashChain([entry("x", "h1")])).toBe(false);
  });
});
