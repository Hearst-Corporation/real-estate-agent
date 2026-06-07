/**
 * lib/invest/settlement/settlement.test.ts — ⑤ Settlement & Funds (Epic 1.5).
 *
 * Couvre les GARDES ACTIVES (Jalon 1) :
 *   - I2 : subscriptionId absent/vide → InvariantViolationError
 *   - I6 : rail non whitelisté (USDT, USDC) → InvariantViolationError
 *   - Rails whitelistés (EUR, EURC, EURe) + subscriptionId valide
 *       → gardes passées → NotImplementedError (stub Jalon 1)
 *   - releaseToSpv → NotImplementedError
 *   - refund → NotImplementedError
 *
 * Aucune dépendance Supabase/réseau : getSupabaseAdmin() est appelé APRÈS les gardes
 * (ligne 37 de index.ts), donc les tests de gardes n'ont pas besoin de mock.
 */

import { describe, it, expect } from "vitest";
import { instructDeposit, releaseToSpv, refund } from "./index";
import { InvariantViolationError, NotImplementedError } from "../shared/errors";

// ════════════════════════════════════════════════════════════════════════════
// instructDeposit — gardes I2 (subscriptionId)
// ════════════════════════════════════════════════════════════════════════════

describe("instructDeposit — I2 (subscriptionId requis)", () => {
  it("subscriptionId absent (undefined cast) → InvariantViolationError I2", async () => {
    await expect(
      instructDeposit({
        subscriptionId: undefined as unknown as string,
        rail: "EUR",
        amountEur: 1000,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof InvariantViolationError && (e as InvariantViolationError).invariant === "I2",
    );
  });

  it("subscriptionId vide ('') → InvariantViolationError I2", async () => {
    await expect(
      instructDeposit({
        subscriptionId: "",
        rail: "EUR",
        amountEur: 500,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof InvariantViolationError && (e as InvariantViolationError).invariant === "I2",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// instructDeposit — garde I6 (rail whitelisté)
// ════════════════════════════════════════════════════════════════════════════

describe("instructDeposit — I6 (rails USDT/USDC refusés)", () => {
  it("rail USDT → InvariantViolationError I6", async () => {
    await expect(
      instructDeposit({
        subscriptionId: "sub-valid-1",
        rail: "USDT" as never, // cast volontaire : teste la garde runtime
        amountEur: 2000,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof InvariantViolationError && (e as InvariantViolationError).invariant === "I6",
    );
  });

  it("rail USDC → InvariantViolationError I6", async () => {
    await expect(
      instructDeposit({
        subscriptionId: "sub-valid-2",
        rail: "USDC" as never,
        amountEur: 1500,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof InvariantViolationError && (e as InvariantViolationError).invariant === "I6",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// instructDeposit — rails whitelistés → stub NotImplementedError (Jalon 1)
// ════════════════════════════════════════════════════════════════════════════

describe("instructDeposit — rails whitelistés (gardes passées → stub Jalon 1)", () => {
  it("rail EUR + subscriptionId valide → NotImplementedError", async () => {
    await expect(
      instructDeposit({ subscriptionId: "sub-eur-1", rail: "EUR", amountEur: 10_000 }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("rail EURC + subscriptionId valide → NotImplementedError", async () => {
    await expect(
      instructDeposit({ subscriptionId: "sub-eurc-1", rail: "EURC", amountEur: 5_000 }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("rail EURe + subscriptionId valide → NotImplementedError", async () => {
    await expect(
      instructDeposit({ subscriptionId: "sub-eure-1", rail: "EURe", amountEur: 3_000 }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// releaseToSpv — stub Jalon 1
// ════════════════════════════════════════════════════════════════════════════

describe("releaseToSpv — stub Jalon 1", () => {
  it("dealId valide → NotImplementedError", async () => {
    await expect(releaseToSpv("deal-valid-1")).rejects.toBeInstanceOf(NotImplementedError);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// refund — stub Jalon 1
// ════════════════════════════════════════════════════════════════════════════

describe("refund — stub Jalon 1", () => {
  it("subscriptionId valide → NotImplementedError", async () => {
    await expect(refund("sub-refund-1")).rejects.toBeInstanceOf(NotImplementedError);
  });
});
