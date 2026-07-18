import { describe, it, expect } from "vitest";
import {
  analyzeMandateRenewal,
  summarizeActivity,
  summarizeFeedback,
  summarizeMarket,
  buildProposal,
  daysUntil,
  type MandateInput,
  type VisitInput,
  type VisitReportInput,
  type EstimationInput,
} from "@/lib/mandate-renewal/aggregate";

const NOW = new Date("2026-07-18T12:00:00Z");

function mandate(over: Partial<MandateInput> = {}): MandateInput {
  return {
    id: "m1",
    reference: "MAND-001",
    kind: "exclusif",
    status: "active",
    property_id: "p1",
    asking_price: 500_000,
    signed_at: "2026-01-18T00:00:00Z",
    expires_at: "2026-07-25T00:00:00Z", // 7 j
    ...over,
  };
}

function visit(over: Partial<VisitInput> = {}): VisitInput {
  return {
    id: `v${Math.random()}`,
    status: "realisee",
    scheduled_at: "2026-07-01T10:00:00Z",
    feedback: null,
    notes: null,
    created_at: "2026-06-30T10:00:00Z",
    ...over,
  };
}

describe("daysUntil", () => {
  it("compte les jours restants", () => {
    expect(daysUntil("2026-07-25T12:00:00Z", NOW)).toBe(7);
  });
  it("est négatif si dépassé", () => {
    expect(daysUntil("2026-07-10T12:00:00Z", NOW)).toBeLessThan(0);
  });
});

describe("summarizeActivity", () => {
  it("compte réalisées / à venir", () => {
    const a = summarizeActivity([
      visit({ status: "realisee" }),
      visit({ status: "realisee" }),
      visit({ status: "planifiee" }),
    ]);
    expect(a.visitsTotal).toBe(3);
    expect(a.visitsDone).toBe(2);
    expect(a.visitsUpcoming).toBe(1);
    expect(a.empty).toBe(false);
  });
  it("empty si aucune visite", () => {
    expect(summarizeActivity([]).empty).toBe(true);
  });
});

describe("summarizeFeedback", () => {
  it("agrège CR structurés (positifs + objections)", () => {
    const visits = [visit({ id: "v1" }), visit({ id: "v2" })];
    const reports: VisitReportInput[] = [
      {
        visit_id: "v1",
        interest: "tres_interesse",
        outcome: "offre_probable",
        positives: "belle vue",
        objections: null,
        price_discussed: null,
        reported_at: "2026-07-02T00:00:00Z",
      },
      {
        visit_id: "v2",
        interest: "peu_interesse",
        outcome: "abandon",
        positives: null,
        objections: "cuisine trop petite",
        price_discussed: null,
        reported_at: "2026-07-03T00:00:00Z",
      },
    ];
    const f = summarizeFeedback(visits, reports);
    expect(f.available).toBe(true);
    expect(f.positiveSignals).toBe(1);
    expect(f.objections).toHaveLength(1);
    expect(f.objections[0].text).toBe("cuisine trop petite");
    expect(f.missingReports).toBe(0);
  });

  it("retombe sur le texte libre si pas de CR structuré", () => {
    const visits = [visit({ id: "v1", feedback: "prix trop élevé" })];
    const f = summarizeFeedback(visits, []);
    expect(f.available).toBe(true);
    expect(f.objections[0].text).toBe("prix trop élevé");
  });

  it("compte les visites réalisées sans aucun retour", () => {
    const visits = [visit({ id: "v1" }), visit({ id: "v2" })];
    const f = summarizeFeedback(visits, []);
    expect(f.available).toBe(false);
    expect(f.missingReports).toBe(2);
  });
});

describe("summarizeMarket", () => {
  it("UNAVAILABLE si aucune estimation exploitable", () => {
    const m = summarizeMarket(500_000, []);
    expect(m.available).toBe(false);
    expect(m.latestMarketValue).toBeNull();
    expect(m.gapEur).toBeNull();
  });

  it("prend l'estimation la plus récente et calcule l'écart", () => {
    const ests: EstimationInput[] = [
      {
        id: "e1",
        market_value: 450_000,
        recommended_price: null,
        valued_at: "2026-06-01T00:00:00Z",
        created_at: "2026-06-01T00:00:00Z",
      },
      {
        id: "e2",
        market_value: 460_000,
        recommended_price: null,
        valued_at: "2026-07-10T00:00:00Z",
        created_at: "2026-07-10T00:00:00Z",
      },
    ];
    const m = summarizeMarket(500_000, ests);
    expect(m.available).toBe(true);
    expect(m.latestMarketValue).toBe(460_000);
    expect(m.gapEur).toBe(40_000);
    expect(m.gapRatio).toBeCloseTo(40_000 / 460_000, 5);
    expect(m.estimationCount).toBe(2);
  });

  it("retombe sur recommended_price si market_value absent", () => {
    const m = summarizeMarket(null, [
      {
        id: "e1",
        market_value: null,
        recommended_price: 300_000,
        valued_at: null,
        created_at: "2026-07-01T00:00:00Z",
      },
    ]);
    expect(m.latestMarketValue).toBe(300_000);
    expect(m.gapEur).toBeNull(); // pas de prix affiché
  });
});

describe("buildProposal (déterministe)", () => {
  it("adjust_price quand sur-évalué au-delà du seuil", () => {
    const activity = summarizeActivity([visit()]);
    const feedback = summarizeFeedback([], []);
    const market = summarizeMarket(500_000, [
      {
        id: "e1",
        market_value: 450_000,
        recommended_price: null,
        valued_at: "2026-07-10T00:00:00Z",
        created_at: "2026-07-10T00:00:00Z",
      },
    ]);
    const p = buildProposal(activity, feedback, market);
    expect(p.action).toBe("adjust_price");
    expect(p.suggestedPrice).toBe(450_000);
    expect(p.reasons.length).toBeGreaterThan(0);
  });

  it("change_strategy quand beaucoup de visites sans retour positif", () => {
    const visits = [
      visit({ id: "a" }),
      visit({ id: "b" }),
      visit({ id: "c" }),
      visit({ id: "d" }),
    ];
    const activity = summarizeActivity(visits);
    const feedback = summarizeFeedback(visits, []); // aucun positif
    const market = summarizeMarket(500_000, [
      {
        id: "e1",
        market_value: 495_000, // écart < 5 %
        recommended_price: null,
        valued_at: "2026-07-10T00:00:00Z",
        created_at: "2026-07-10T00:00:00Z",
      },
    ]);
    const p = buildProposal(activity, feedback, market);
    expect(p.action).toBe("change_strategy");
    expect(p.suggestedPrice).toBeNull();
  });

  it("renew par défaut quand activité saine / retours positifs", () => {
    const visits = [visit({ id: "a" })];
    const activity = summarizeActivity(visits);
    const feedback = summarizeFeedback(visits, [
      {
        visit_id: "a",
        interest: "tres_interesse",
        outcome: "offre_probable",
        positives: null,
        objections: null,
        price_discussed: null,
        reported_at: "2026-07-02T00:00:00Z",
      },
    ]);
    const market = summarizeMarket(null, []);
    const p = buildProposal(activity, feedback, market);
    expect(p.action).toBe("renew");
  });
});

describe("analyzeMandateRenewal (assemblage)", () => {
  it("produit une analyse complète avec proposition", () => {
    const a = analyzeMandateRenewal({
      mandate: mandate(),
      visits: [visit({ id: "v1", feedback: "un peu cher" })],
      reports: [],
      estimations: [
        {
          id: "e1",
          market_value: 460_000,
          recommended_price: null,
          valued_at: "2026-07-10T00:00:00Z",
          created_at: "2026-07-10T00:00:00Z",
        },
      ],
      now: NOW,
    });
    expect(a.mandateId).toBe("m1");
    expect(a.daysUntilExpiry).toBe(7);
    expect(a.proposal.action).toBe("adjust_price"); // 500k vs 460k = +8.7 %
    expect(a.feedback.objections[0].text).toBe("un peu cher");
  });
});
