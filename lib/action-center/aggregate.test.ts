import { describe, expect, it } from "vitest";
import type { ActionItem } from "@/lib/actions/types";
import { aggregateDailyCenter, type RadarLabels, type ApprovalLabels } from "@/lib/action-center/aggregate";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

const radarLabels: RadarLabels = {
  priceDrop: (pct, eur) => `Baisse ${pct}% (${eur} €)`,
  dormant: (d) => `Dormante ${d} j`,
  mandateExpiry: (d) => `Expire dans ${d} j`,
  fallbackAnnonce: "Annonce",
  fallbackMandate: "Mandat",
};
const approvalLabels: ApprovalLabels = {
  pending: (ch) => `Approbation ${ch}`,
  fallback: "Approbation",
};

function core(over: Partial<ActionItem>): ActionItem {
  return {
    id: "c1",
    category: "relance",
    entity: "lead",
    entityId: "l1",
    title: "Lead",
    reason: "r",
    priority: "normale",
    href: "/leads/l1",
    quick: [],
    ...over,
  };
}

describe("aggregateDailyCenter", () => {
  it("fusionne cœur + radar + approbations en cartes scorées triées", () => {
    const out = aggregateDailyCenter({
      coreItems: [core({})],
      radar: {
        priceDrops: [
          {
            kind: "price_drop",
            annonce_id: "a1",
            titre: "T1",
            ville: "Paris",
            url: null,
            prix_actuel: 100,
            prix_precedent: 120,
            drop_eur: 20,
            drop_pct: 16,
            observed_at: new Date(NOW).toISOString(),
          },
        ],
        dormant: [],
        mandateExpiries: [
          {
            kind: "mandate_expiry",
            mandate_id: "m1",
            reference: "REF1",
            kind_label: "exclusif",
            property_id: "p1",
            asking_price: 300000,
            jours_restants: 2,
            expires_at: new Date(NOW + 2 * 86400000).toISOString(),
          },
        ],
      },
      approvals: [{ id: "ap1", channel: "whatsapp", created_at: new Date(NOW).toISOString() }],
      nowMs: NOW,
      radarLabels,
      approvalLabels,
    });

    // 1 core + 1 drop + 1 mandate + 1 approval = 4 cartes.
    expect(out).toHaveLength(4);
    // Toutes ont un href réel et un score borné.
    for (const s of out) {
      expect(s.href).toMatch(/^\//);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.explanation.length).toBeGreaterThan(0);
    }
    // Tri décroissant.
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
  });

  it("la carte radar porte un signalStrength → contribution signalStrength", () => {
    const out = aggregateDailyCenter({
      coreItems: [],
      radar: {
        priceDrops: [
          {
            kind: "price_drop",
            annonce_id: "a1",
            titre: null,
            ville: null,
            url: null,
            prix_actuel: 100,
            prix_precedent: 200,
            drop_eur: 100,
            drop_pct: 50,
            observed_at: new Date(NOW).toISOString(),
          },
        ],
        dormant: [],
        mandateExpiries: [],
      },
      approvals: null,
      nowMs: NOW,
      radarLabels,
      approvalLabels,
    });
    expect(out).toHaveLength(1);
    expect(out[0].explanation.some((c) => c.factor === "signalStrength")).toBe(true);
    expect(out[0].href).toBe("/radar");
  });

  it("radar null / approvals null → seulement le cœur (dégradation honnête)", () => {
    const out = aggregateDailyCenter({
      coreItems: [core({}), core({ id: "c2", entityId: "l2" })],
      radar: null,
      approvals: null,
      nowMs: NOW,
      radarLabels,
      approvalLabels,
    });
    expect(out).toHaveLength(2);
    expect(out.every((s) => !s.explanation.some((c) => c.factor === "signalStrength"))).toBe(true);
  });

  it("dédoublonne par id en gardant le meilleur score", () => {
    const dup = core({ id: "dup" });
    const out = aggregateDailyCenter({
      coreItems: [dup, dup],
      radar: null,
      approvals: null,
      nowMs: NOW,
      radarLabels,
      approvalLabels,
    });
    expect(out).toHaveLength(1);
  });

  it("l'approbation pointe vers /approvals avec action validate", () => {
    const out = aggregateDailyCenter({
      coreItems: [],
      radar: null,
      approvals: [{ id: "ap1", channel: "sms", created_at: null }],
      nowMs: NOW,
      radarLabels,
      approvalLabels,
    });
    expect(out[0].href).toBe("/approvals");
    expect(out[0].quick.some((q) => q.kind === "validate")).toBe(true);
  });
});
