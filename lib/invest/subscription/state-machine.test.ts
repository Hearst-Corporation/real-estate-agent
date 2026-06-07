/**
 * lib/invest/subscription/state-machine.test.ts — ③ machine à états (PUR).
 *
 * Vérifie les transitions valides ET les gardes anti-FIA (I2/I3/I6).
 */

import { describe, it, expect } from "vitest";
import { transition, isTerminal, availableEvents } from "./index";
import { InvariantViolationError } from "../shared/errors";

describe("transition — chemin nominal", () => {
  it("reserved --sign--> signed", () => {
    const r = transition("reserved", { type: "sign", envelopeId: "e1" });
    expect(r).toEqual({ ok: true, value: "signed" });
  });
  it("signed --fund--> funded (rail EUR)", () => {
    const r = transition("signed", { type: "fund", rail: "EUR", amountEur: 100_000 });
    expect(r.ok && r.value).toBe("funded");
  });
  it("funded --allocate--> allocated", () => {
    expect(transition("funded", { type: "allocate" })).toEqual({ ok: true, value: "allocated" });
  });
  it("allocated --mint--> minted (I1 : DEEP avant miroir)", () => {
    expect(transition("allocated", { type: "mint" })).toEqual({ ok: true, value: "minted" });
  });
});

describe("transition — gardes anti-FIA", () => {
  it("I3 : on ne peut PAS financer sans avoir signé (reserved --fund--> refusé)", () => {
    const r = transition("reserved", { type: "fund", rail: "EUR", amountEur: 100_000 });
    expect(r.ok).toBe(false);
  });

  it("I2 : montant de versement nul → InvariantViolationError", () => {
    expect(() => transition("signed", { type: "fund", rail: "EUR", amountEur: 0 })).toThrow(
      InvariantViolationError,
    );
  });

  it("I6 : rail non whitelisté → InvariantViolationError", () => {
    expect(() =>
      // @ts-expect-error — USDT n'est pas un SettlementCurrency (refusé au type ET au runtime)
      transition("signed", { type: "fund", rail: "USDT", amountEur: 100_000 }),
    ).toThrow(InvariantViolationError);
  });

  it("mint impossible avant allocate (funded --mint--> refusé)", () => {
    expect(transition("funded", { type: "mint" }).ok).toBe(false);
  });
});

describe("transition — sorties & terminaux", () => {
  it("signed --withdraw--> withdrawn (rétractation 4j ECSP)", () => {
    expect(transition("signed", { type: "withdraw" })).toEqual({ ok: true, value: "withdrawn" });
  });
  it("funded --refund--> refunded", () => {
    expect(transition("funded", { type: "refund" })).toEqual({ ok: true, value: "refunded" });
  });
  it("états terminaux n'ont aucune transition", () => {
    for (const s of ["minted", "refunded", "cancelled", "withdrawn"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(availableEvents(s)).toEqual([]);
    }
  });
  it("transition depuis un terminal est refusée", () => {
    expect(transition("minted", { type: "refund" }).ok).toBe(false);
  });
});
