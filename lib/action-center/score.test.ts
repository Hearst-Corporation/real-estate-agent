import { describe, expect, it } from "vitest";
import type { ActionItem } from "@/lib/actions/types";
import { WEIGHTS, scoreAction, sortScored, SCORE_MAX } from "@/lib/action-center/score";
import type { ScoredAction } from "@/lib/action-center/types";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

function item(over: Partial<ActionItem>): ActionItem {
  return {
    id: "x",
    category: "relance",
    entity: "lead",
    entityId: "e1",
    title: "t",
    reason: "r",
    priority: "normale",
    href: "/leads/e1",
    quick: [],
    ...over,
  };
}

describe("scoreAction — déterminisme & explicabilité", () => {
  it("est déterministe : même entrée → même score", () => {
    const a = scoreAction(item({}), NOW);
    const b = scoreAction(item({}), NOW);
    expect(a.score).toBe(b.score);
    expect(a.explanation).toEqual(b.explanation);
  });

  it("le score est la somme plafonnée des contributions", () => {
    const s = scoreAction(item({ category: "overdue", priority: "haute" }), NOW);
    const sum = s.explanation.reduce((n, c) => n + c.points, 0);
    expect(s.score).toBe(Math.min(SCORE_MAX, sum));
  });

  it("inclut base + priorité (normale)", () => {
    const s = scoreAction(item({ category: "relance", priority: "normale" }), NOW);
    expect(s.explanation.find((c) => c.factor === "base")?.points).toBe(WEIGHTS.base.relance);
    expect(s.explanation.find((c) => c.factor === "priority")?.points).toBe(
      WEIGHTS.priority.normale,
    );
  });

  it("priorité basse n'ajoute aucune contribution priorité", () => {
    const s = scoreAction(item({ priority: "basse" }), NOW);
    expect(s.explanation.find((c) => c.factor === "priority")).toBeUndefined();
  });

  it("un item en retard reçoit le bonus overdue croissant et borné", () => {
    const j2 = scoreAction(item({ category: "task", when: iso(NOW, -2) }), NOW);
    const j10 = scoreAction(item({ category: "task", when: iso(NOW, -10) }), NOW);
    const p2 = pts(j2, "overdue");
    const p10 = pts(j10, "overdue");
    expect(p2).toBeGreaterThan(0);
    expect(p10).toBeGreaterThan(p2);
    expect(p10).toBeLessThanOrEqual(WEIGHTS.overdueMax);
  });

  it("le bonus overdue sature au plafond au-delà de la fenêtre", () => {
    const far = scoreAction(item({ category: "task", when: iso(NOW, -365) }), NOW);
    expect(pts(far, "overdue")).toBe(WEIGHTS.overdueMax);
  });

  it("une échéance imminente reçoit dueSoon, pas overdue", () => {
    const soon = scoreAction(item({ category: "today", when: iso(NOW, 0, 3) }), NOW);
    expect(pts(soon, "dueSoon")).toBe(WEIGHTS.dueSoon);
    expect(soon.explanation.find((c) => c.factor === "overdue")).toBeUndefined();
  });

  it("une carte radar reçoit signalStrength proportionnel (0..1 → 0..signalMax)", () => {
    const weak = scoreAction(item({ category: "proprietaire" }), NOW, 0.2);
    const strong = scoreAction(item({ category: "proprietaire" }), NOW, 1);
    expect(pts(strong, "signalStrength")).toBe(WEIGHTS.signalMax);
    expect(pts(weak, "signalStrength")).toBeGreaterThan(0);
    expect(pts(strong, "signalStrength")).toBeGreaterThan(pts(weak, "signalStrength"));
  });

  it("signalStrength est clampé hors bornes", () => {
    const over = scoreAction(item({}), NOW, 5);
    const under = scoreAction(item({}), NOW, -3);
    expect(pts(over, "signalStrength")).toBe(WEIGHTS.signalMax);
    expect(under.explanation.find((c) => c.factor === "signalStrength")).toBeUndefined();
  });

  it("topFactor est la plus forte contribution", () => {
    const s = scoreAction(item({ category: "overdue", priority: "haute", when: iso(NOW, -30) }), NOW);
    // base overdue (55) domine priorité (20) et overdue bonus (25).
    expect(s.topFactor).toBe("base");
  });

  it("le score reste dans [0..100]", () => {
    const s = scoreAction(
      item({ category: "overdue", priority: "haute", when: iso(NOW, -999) }),
      NOW,
      1,
    );
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
});

describe("sortScored — tri stable par score décroissant", () => {
  it("trie par score décroissant puis échéance", () => {
    const items: ScoredAction[] = [
      scoreAction(item({ id: "low", category: "acquereur" }), NOW),
      scoreAction(item({ id: "high", category: "overdue", priority: "haute" }), NOW),
      scoreAction(item({ id: "mid", category: "relance" }), NOW),
    ];
    const sorted = sortScored(items);
    expect(sorted.map((s) => s.id)).toEqual(["high", "mid", "low"]);
  });

  it("ne mute pas l'entrée", () => {
    const items = [scoreAction(item({ id: "a" }), NOW), scoreAction(item({ id: "b" }), NOW)];
    const before = items.map((s) => s.id);
    sortScored(items);
    expect(items.map((s) => s.id)).toEqual(before);
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────
function iso(baseMs: number, days: number, hours = 0): string {
  return new Date(baseMs + days * 86_400_000 + hours * 3_600_000).toISOString();
}
function pts(s: ScoredAction, factor: string): number {
  return s.explanation.find((c) => c.factor === factor)?.points ?? 0;
}
