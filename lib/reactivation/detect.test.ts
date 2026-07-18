import { describe, it, expect } from "vitest";
import {
  detectDormant,
  daysBetween,
  mostRecent,
  suggestChannel,
  matchHintsFor,
  type LeadRow,
  type CritereRow,
  type MandateRow,
  type VisitRow,
  type PropertyRow,
  type DetectInput,
} from "./detect";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function baseInput(over: Partial<DetectInput> = {}): DetectInput {
  return {
    leads: [],
    criteres: [],
    mandates: [],
    visits: [],
    messages: [],
    properties: [],
    thresholdDays: 45,
    now: NOW,
    ...over,
  };
}

const lead = (o: Partial<LeadRow>): LeadRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Marie Dupont",
  email: "marie@example.com",
  phone: null,
  kind: "acheteur",
  status: "contacted",
  updated_at: daysAgo(60),
  created_at: daysAgo(120),
  ...o,
});

describe("helpers", () => {
  it("daysBetween arrondi bas, null → 0", () => {
    expect(daysBetween(daysAgo(45), NOW)).toBe(45);
    expect(daysBetween(null, NOW)).toBe(0);
    expect(daysBetween("pas une date", NOW)).toBe(0);
  });

  it("mostRecent ignore null/invalides et prend le plus récent", () => {
    expect(mostRecent([daysAgo(30), daysAgo(10), null, "x"])).toBe(daysAgo(10));
    expect(mostRecent([null, undefined])).toBeNull();
  });

  it("suggestChannel priorise email puis whatsapp puis null", () => {
    expect(suggestChannel({ email: "a@b.c", phone: "06" })).toBe("email");
    expect(suggestChannel({ phone: "06" })).toBe("whatsapp");
    expect(suggestChannel({})).toBeNull();
    expect(suggestChannel(null)).toBeNull();
  });
});

describe("detectDormant — acquéreurs", () => {
  it("ressort un acheteur inactif au-delà du seuil, avec explication chiffrée", () => {
    const res = detectDormant(baseInput({ leads: [lead({ updated_at: daysAgo(60) })] }));
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe("acquereur");
    expect(res[0].jours_inactif).toBe(60);
    expect(res[0].reasons[0].code).toBe("no_activity_since");
    expect(res[0].reasons[0].label).toContain("60 jours");
    expect(res[0].suggested_channel).toBe("email");
  });

  it("ne ressort PAS un acheteur actif (sous le seuil)", () => {
    const res = detectDormant(baseInput({ leads: [lead({ updated_at: daysAgo(10) })] }));
    expect(res).toHaveLength(0);
  });

  it("ne ressort PAS un lead au statut non éligible (perdu/converti)", () => {
    const res = detectDormant(
      baseInput({ leads: [lead({ status: "lost", updated_at: daysAgo(90) })] }),
    );
    expect(res).toHaveLength(0);
  });

  it("une visite récente remet le lead actif (dernière activité = max)", () => {
    const visits: VisitRow[] = [
      { lead_id: lead({}).id, scheduled_at: daysAgo(5), updated_at: daysAgo(5) },
    ];
    const res = detectDormant(baseInput({ leads: [lead({ updated_at: daysAgo(90) })], visits }));
    expect(res).toHaveLength(0);
  });

  it("cite les biens qui matchent le critère de l'acquéreur", () => {
    const critere: CritereRow = {
      id: "22222222-2222-2222-2222-222222222222",
      lead_id: lead({}).id,
      nom: "T3 Lyon",
      telephone: null,
      actif: true,
      type_bien: ["appartement"],
      budget_min: 200000,
      budget_max: 350000,
      surface_min: 50,
      surface_max: null,
      pieces_min: 3,
      zones: [],
      updated_at: daysAgo(70),
      created_at: daysAgo(120),
    };
    const properties: PropertyRow[] = [
      {
        id: "33333333-3333-3333-3333-333333333333",
        title: "Bel appartement",
        city: "Lyon",
        postal_code: "69003",
        asking_price: 300000,
        property_type: "appartement",
        surface: 62,
        rooms: 3,
        status: "active",
      },
      {
        id: "44444444-4444-4444-4444-444444444444",
        title: "Trop cher",
        city: "Lyon",
        postal_code: "69003",
        asking_price: 900000,
        property_type: "appartement",
        surface: 62,
        rooms: 3,
        status: "active",
      },
    ];
    const res = detectDormant(
      baseInput({ leads: [lead({ updated_at: daysAgo(70) })], criteres: [critere], properties }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].match_hints.map((h) => h.property_id)).toEqual([
      "33333333-3333-3333-3333-333333333333",
    ]);
    expect(res[0].reasons.some((r) => r.code === "matching_properties")).toBe(true);
    expect(res[0].reasons.some((r) => r.code === "active_criteria")).toBe(true);
  });

  it("matchHintsFor exclut les biens hors budget et statut", () => {
    const critere = {
      budget_min: 100000,
      budget_max: 200000,
      surface_min: null,
      pieces_min: null,
    } as CritereRow;
    const props: PropertyRow[] = [
      { id: "a", title: null, city: null, postal_code: null, asking_price: 150000, property_type: null, surface: null, rooms: null, status: "active" },
      { id: "b", title: null, city: null, postal_code: null, asking_price: 150000, property_type: null, surface: null, rooms: null, status: "sold" },
      { id: "c", title: null, city: null, postal_code: null, asking_price: 500000, property_type: null, surface: null, rooms: null, status: "active" },
    ];
    expect(matchHintsFor(critere, props).map((h) => h.property_id)).toEqual(["a"]);
  });
});

describe("detectDormant — propriétaires", () => {
  it("ressort un mandat actif dormant avec raison active_mandate", () => {
    const mandate: MandateRow = {
      id: "55555555-5555-5555-5555-555555555555",
      reference: "MAND-001",
      kind: "exclusif",
      status: "active",
      property_id: "66666666-6666-6666-6666-666666666666",
      asking_price: 400000,
      signed_at: daysAgo(80),
      updated_at: daysAgo(80),
      created_at: daysAgo(100),
    };
    const res = detectDormant(baseInput({ mandates: [mandate] }));
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe("proprietaire");
    expect(res[0].jours_inactif).toBe(80);
    expect(res[0].reasons.some((r) => r.code === "active_mandate")).toBe(true);
  });

  it("ignore un mandat expiré/inactif", () => {
    const mandate = {
      id: "77777777-7777-7777-7777-777777777777",
      reference: null,
      kind: "simple",
      status: "expired",
      property_id: null,
      asking_price: null,
      signed_at: null,
      updated_at: daysAgo(200),
      created_at: daysAgo(300),
    } as MandateRow;
    expect(detectDormant(baseInput({ mandates: [mandate] }))).toHaveLength(0);
  });
});

describe("detectDormant — tri & dédup", () => {
  it("trie par inactivité décroissante", () => {
    const res = detectDormant(
      baseInput({
        leads: [
          lead({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", updated_at: daysAgo(50) }),
          lead({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", updated_at: daysAgo(120) }),
        ],
      }),
    );
    expect(res.map((r) => r.jours_inactif)).toEqual([120, 50]);
  });
});
