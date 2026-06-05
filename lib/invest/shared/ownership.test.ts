/**
 * lib/invest/shared/ownership.test.ts — garde d'appartenance (PUR, I9).
 * Le service-role bypass la RLS → ces asserts sont la dernière ligne de défense.
 */

import { describe, it, expect } from "vitest";
import { assertOwnership, assertTenant } from "./ownership";
import { InvariantViolationError } from "./errors";

describe("assertTenant", () => {
  it("laisse passer si le tenant correspond", () => {
    const row = { tenant_id: "t1", foo: 42 };
    expect(assertTenant(row, "t1")).toBe(row);
  });
  it("lève InvariantViolationError (I9) si le tenant diffère", () => {
    expect(() => assertTenant({ tenant_id: "t2" }, "t1")).toThrow(InvariantViolationError);
  });
  it("expose l'invariant I9 sur l'erreur", () => {
    try {
      assertTenant({ tenant_id: "t2" }, "t1");
      expect.unreachable("aurait dû lever");
    } catch (e) {
      expect((e as InvariantViolationError).invariant).toBe("I9");
    }
  });
});

describe("assertOwnership", () => {
  it("ok tenant + user concordants", () => {
    const row = { tenant_id: "t1", user_id: "u1" };
    expect(assertOwnership(row, { tenantId: "t1", userId: "u1" })).toBe(row);
  });
  it("lève si le tenant diffère (même si user ok)", () => {
    expect(() =>
      assertOwnership({ tenant_id: "t2", user_id: "u1" }, { tenantId: "t1", userId: "u1" }),
    ).toThrow(InvariantViolationError);
  });
  it("lève si l'owner diffère (tenant ok)", () => {
    expect(() =>
      assertOwnership({ tenant_id: "t1", user_id: "u2" }, { tenantId: "t1", userId: "u1" }),
    ).toThrow(InvariantViolationError);
  });
  it("n'asserte PAS l'owner quand ctx.userId est absent (ressource tenant)", () => {
    const row = { tenant_id: "t1", user_id: "u2" };
    expect(assertOwnership(row, { tenantId: "t1" })).toBe(row);
  });
  it("n'asserte PAS l'owner quand la ligne n'a pas de user_id", () => {
    const row = { tenant_id: "t1" };
    expect(assertOwnership(row, { tenantId: "t1", userId: "u1" })).toBe(row);
  });
  it("lève si la ligne a user_id null mais qu'un userId est attendu", () => {
    expect(() =>
      assertOwnership({ tenant_id: "t1", user_id: null }, { tenantId: "t1", userId: "u1" }),
    ).toThrow(InvariantViolationError);
  });
});
