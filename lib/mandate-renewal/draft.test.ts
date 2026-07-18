import { describe, it, expect } from "vitest";
import { generateOwnerDraft } from "@/lib/mandate-renewal/draft";
import {
  analyzeMandateRenewal,
  type MandateInput,
} from "@/lib/mandate-renewal/aggregate";

const NOW = new Date("2026-07-18T12:00:00Z");

const mandate: MandateInput = {
  id: "m1",
  reference: "MAND-001",
  kind: "exclusif",
  status: "active",
  property_id: "p1",
  asking_price: 500_000,
  signed_at: "2026-01-18T00:00:00Z",
  expires_at: "2026-07-25T00:00:00Z",
};

function analyze(over?: Parameters<typeof analyzeMandateRenewal>[0]) {
  return analyzeMandateRenewal(
    over ?? {
      mandate,
      visits: [
        {
          id: "v1",
          status: "realisee",
          scheduled_at: "2026-07-01T10:00:00Z",
          feedback: "cuisine à revoir",
          notes: null,
          created_at: "2026-06-30T10:00:00Z",
        },
      ],
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
    },
  );
}

describe("generateOwnerDraft", () => {
  it("compose sujet + corps sans rien inventer", () => {
    const d = generateOwnerDraft(analyze(), {
      propertyLabel: "Appartement Bastille",
      ownerName: "Marie",
    });
    expect(d.subject).toContain("Appartement Bastille");
    expect(d.body).toContain("Bonjour Marie,");
    expect(d.body).toContain("Appartement Bastille");
    // Chiffres réels présents (espaces = séparateurs Intl variables → on normalise).
    const flat = d.body.replace(/\s/g, "");
    expect(flat).toContain("460000€"); // marché
    expect(flat).toContain("500000€"); // affiché
    // Objection réelle reprise.
    expect(d.body).toContain("cuisine à revoir");
  });

  it("salutation générique si propriétaire inconnu", () => {
    const d = generateOwnerDraft(analyze(), { propertyLabel: "Bien X" });
    expect(d.body.startsWith("Bonjour,")).toBe(true);
  });

  it("mentionne l'ajustement de prix quand recommandé", () => {
    const d = generateOwnerDraft(analyze(), { propertyLabel: "Bien X" });
    // 500k vs 460k = sur-évalué → adjust_price
    expect(analyze().proposal.action).toBe("adjust_price");
    expect(d.body.toLowerCase()).toContain("ajuster");
  });

  it("reste cohérent sans estimation (marché indisponible)", () => {
    const a = analyze({
      mandate,
      visits: [],
      reports: [],
      estimations: [],
      now: NOW,
    });
    const d = generateOwnerDraft(a, { propertyLabel: "Bien X" });
    expect(d.body).not.toContain("estimation de marché la plus récente");
    expect(d.subject).toContain("Bien X");
  });
});
