/**
 * lib/invest/tokenization/reconcile.test.ts — ⑥ règle d'or réconciliation (PUR, §5.2).
 * DEEP gagne TOUJOURS.
 */

import { describe, it, expect } from "vitest";
import { reconcileWallet } from "./index";

describe("reconcileWallet (§5.2 — DEEP prime)", () => {
  it("chaîne == DEEP → in_sync", () => {
    expect(reconcileWallet({ expectedUnits: 10, onchainUnits: 10 })).toBe("in_sync");
  });
  it("chaîne < DEEP → mint_missing", () => {
    expect(reconcileWallet({ expectedUnits: 10, onchainUnits: 7 })).toBe("mint_missing");
  });
  it("chaîne > DEEP → chain_exceeds_deep (anomalie I1)", () => {
    expect(reconcileWallet({ expectedUnits: 10, onchainUnits: 12 })).toBe("chain_exceeds_deep");
  });
});
