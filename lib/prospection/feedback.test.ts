import { describe, it, expect } from "vitest";
import { normalizeSignal, signalOutcome } from "./feedback";

describe("normalizeSignal", () => {
  it("mappe 👍 (up/like) → like et 👎 (down/dislike) → dislike (valeurs DB réelles)", () => {
    expect(normalizeSignal("up")).toBe("like");
    expect(normalizeSignal("like")).toBe("like");
    expect(normalizeSignal("down")).toBe("dislike");
    expect(normalizeSignal("dislike")).toBe("dislike");
  });

  it("contact/visite sont des signaux DB valides (historique des propositions)", () => {
    expect(normalizeSignal("contact")).toBe("contact");
    expect(normalizeSignal("visite")).toBe("visite");
  });

  it("insensible à la casse et aux espaces", () => {
    expect(normalizeSignal(" UP ")).toBe("like");
    expect(normalizeSignal("LIKE")).toBe("like");
    expect(normalizeSignal("Contact")).toBe("contact");
  });

  it("signal inconnu ou non-string → null (→ 400 côté route)", () => {
    expect(normalizeSignal("up_vote")).toBeNull();
    expect(normalizeSignal("")).toBeNull();
    expect(normalizeSignal(null)).toBeNull();
    expect(normalizeSignal(undefined)).toBeNull();
    expect(normalizeSignal(42)).toBeNull();
  });

  it("ne renvoie JAMAIS 'up'/'down'/'verdict' (jamais écrit en DB tel quel — CHECK like|dislike|contact|visite)", () => {
    const outcomes = ["up", "down", "like", "dislike", "contact", "visite", "x"].map(normalizeSignal);
    for (const o of outcomes) {
      expect(["like", "dislike", "contact", "visite", null]).toContain(o);
    }
  });
});

describe("signalOutcome", () => {
  it("traduit le signal DB en sens produit", () => {
    expect(signalOutcome("like")).toBe("retenue");
    expect(signalOutcome("dislike")).toBe("refusee");
    expect(signalOutcome("contact")).toBe("contactee");
    expect(signalOutcome("visite")).toBe("visitee");
  });
});
