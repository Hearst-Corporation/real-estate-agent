import { describe, it, expect } from "vitest";
import { normalizeVerdict } from "./feedback";

describe("normalizeVerdict", () => {
  it("accepte up/down directement (valeurs DB canoniques)", () => {
    expect(normalizeVerdict("up")).toBe("up");
    expect(normalizeVerdict("down")).toBe("down");
  });

  it("convertit le legacy like→up et dislike→down", () => {
    expect(normalizeVerdict("like")).toBe("up");
    expect(normalizeVerdict("dislike")).toBe("down");
  });

  it("contact/visite → noop (reconnu mais PAS écrit en DB)", () => {
    expect(normalizeVerdict("contact")).toBe("noop");
    expect(normalizeVerdict("visite")).toBe("noop");
  });

  it("insensible à la casse et aux espaces", () => {
    expect(normalizeVerdict(" UP ")).toBe("up");
    expect(normalizeVerdict("LIKE")).toBe("up");
    expect(normalizeVerdict("Contact")).toBe("noop");
  });

  it("verdict inconnu ou non-string → null (→ 400 côté route)", () => {
    expect(normalizeVerdict("up_vote")).toBeNull();
    expect(normalizeVerdict("")).toBeNull();
    expect(normalizeVerdict(null)).toBeNull();
    expect(normalizeVerdict(undefined)).toBeNull();
    expect(normalizeVerdict(42)).toBeNull();
  });

  it("ne renvoie JAMAIS like/dislike/contact/visite (jamais écrit en DB tel quel)", () => {
    const outcomes = ["up", "down", "like", "dislike", "contact", "visite", "x"].map(normalizeVerdict);
    for (const o of outcomes) {
      expect(["up", "down", "noop", null]).toContain(o);
    }
  });
});
