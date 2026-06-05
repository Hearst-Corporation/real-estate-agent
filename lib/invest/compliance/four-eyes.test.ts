/**
 * lib/invest/compliance/four-eyes.test.ts — ⑧ 4-eyes + screening (PUR, §6.3).
 */

import { describe, it, expect } from "vitest";
import { validateFourEyes, assertScreeningClean } from "./index";
import { ComplianceBlockedError } from "../shared/errors";

describe("validateFourEyes", () => {
  it("ok si deux approbateurs distincts", () => {
    expect(validateFourEyes({ approver1: "a", approver2: "b" })).toEqual({ ok: true, value: true });
  });
  it("refuse un seul approbateur", () => {
    expect(validateFourEyes({ approver1: "a", approver2: null }).ok).toBe(false);
  });
  it("refuse deux approbateurs identiques", () => {
    expect(validateFourEyes({ approver1: "a", approver2: "a" }).ok).toBe(false);
  });
});

describe("assertScreeningClean", () => {
  it("clean ne lève pas", () => {
    expect(() => assertScreeningClean("clean")).not.toThrow();
  });
  it("sanctions → ComplianceBlockedError", () => {
    expect(() => assertScreeningClean("sanctions")).toThrow(ComplianceBlockedError);
  });
  it("mixer → ComplianceBlockedError", () => {
    expect(() => assertScreeningClean("mixer")).toThrow(ComplianceBlockedError);
  });
});
