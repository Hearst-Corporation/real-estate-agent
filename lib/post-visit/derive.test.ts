import { describe, it, expect } from "vitest";
import {
  deriveSignals,
  deriveCriteriaSuggestions,
  deriveRelances,
  BUDGET_SUGGESTION_MIN_GAP_RATIO,
} from "./derive";
import type { VisitReportRow } from "@/lib/visit-report/schema";

function report(overrides: Partial<VisitReportRow> = {}): VisitReportRow {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    visit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    tenant_id: "real-estate-agent",
    user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    interest: "interesse",
    positives: null,
    objections: null,
    price_discussed: null,
    next_action: null,
    outcome: "a_relancer",
    reported_at: "2026-07-18T10:00:00Z",
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    ...overrides,
  };
}

describe("deriveSignals", () => {
  it("reprend fidèlement interest/outcome/objections/prix du CR (aucune invention)", () => {
    const r = report({
      interest: "tres_interesse",
      outcome: "offre_probable",
      objections: "Cuisine à refaire",
      price_discussed: 320000,
    });
    expect(deriveSignals(r)).toEqual({
      interest: "tres_interesse",
      outcome: "offre_probable",
      objections: "Cuisine à refaire",
      price_discussed: 320000,
    });
  });

  it("normalise objections/prix absents en null", () => {
    const s = deriveSignals(report());
    expect(s.objections).toBeNull();
    expect(s.price_discussed).toBeNull();
  });
});

describe("deriveCriteriaSuggestions", () => {
  it("suggère de relever budget_max quand le prix évoqué le dépasse (au-delà de la marge)", () => {
    const s = deriveCriteriaSuggestions(report({ price_discussed: 320000 }), {
      budgetMin: undefined,
      budgetMax: 300000,
    });
    expect(s).toHaveLength(1);
    expect(s[0].field).toBe("budget_max");
    expect(s[0].current).toBe(300000);
    expect(s[0].suggested).toBe(320000);
    expect(s[0].reason).toContain("320");
  });

  it("ne suggère RIEN si l'écart est dans la marge de tolérance", () => {
    const withinMargin = 300000 * (1 + BUDGET_SUGGESTION_MIN_GAP_RATIO) - 1;
    const s = deriveCriteriaSuggestions(report({ price_discussed: withinMargin }), {
      budgetMax: 300000,
    });
    expect(s).toHaveLength(0);
  });

  it("suggère de baisser budget_min quand le prix évoqué est en-dessous", () => {
    const s = deriveCriteriaSuggestions(report({ price_discussed: 250000 }), {
      budgetMin: 280000,
      budgetMax: 400000,
    });
    expect(s.some((x) => x.field === "budget_min" && x.suggested === 250000)).toBe(true);
  });

  it("ne suggère rien sans prix évoqué ou sans budget", () => {
    expect(deriveCriteriaSuggestions(report({ price_discussed: null }), { budgetMax: 300000 })).toHaveLength(0);
    expect(deriveCriteriaSuggestions(report({ price_discussed: 320000 }), {})).toHaveLength(0);
  });
});

describe("deriveRelances", () => {
  it("offre_probable → 1 task haute priorité 'préparer l'offre'", () => {
    const r = deriveRelances(report({ outcome: "offre_probable" }));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("task");
    expect(r[0].priority).toBe("haute");
  });

  it("a_relancer → 1 task + 1 brouillon (DRAFT)", () => {
    const r = deriveRelances(report({ outcome: "a_relancer", objections: "Prix" }));
    expect(r.filter((x) => x.kind === "task")).toHaveLength(1);
    expect(r.filter((x) => x.kind === "draft")).toHaveLength(1);
    // Les objections du CR sont reprises dans le corps de la task.
    expect(r.find((x) => x.kind === "task")?.body).toContain("Prix");
  });

  it("reflexion → 1 task de suivi", () => {
    const r = deriveRelances(report({ outcome: "reflexion" }));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("task");
  });

  it("abandon → aucune relance (pas de harcèlement, rien d'inventé)", () => {
    expect(deriveRelances(report({ outcome: "abandon" }))).toHaveLength(0);
  });
});
