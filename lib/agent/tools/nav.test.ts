import { describe, it, expect } from "vitest";
import { isAllowedPath } from "./nav";

describe("isAllowedPath (whitelist navigate)", () => {
  it("autorise /prospection (régression : était absent → « Navigation refusée »)", () => {
    expect(isAllowedPath("/prospection")).toBe(true);
  });

  it("autorise les pages principales de la nav agent", () => {
    for (const p of ["/", "/prospection", "/properties", "/leads", "/visits", "/agenda", "/estimations"]) {
      expect(isAllowedPath(p)).toBe(true);
    }
  });

  it("autorise une fiche /estimations/<uuid> ou /properties/<uuid>", () => {
    expect(isAllowedPath("/estimations/e4d3e64b-65fc-4fee-b351-53decf0dd70f")).toBe(true);
    expect(isAllowedPath("/properties/5be78343-2842-4ecd-a8bc-35073ed466d4")).toBe(true);
  });

  it("refuse un chemin inconnu ou un faux uuid", () => {
    expect(isAllowedPath("/admin")).toBe(false);
    expect(isAllowedPath("/prospection/foo")).toBe(false);
    expect(isAllowedPath("/estimations/not-a-uuid")).toBe(false);
  });
});
