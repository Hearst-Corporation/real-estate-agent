import { describe, expect, it } from "vitest";
import {
  addressOf,
  buildSeries,
  computeVariation,
  formatDeltaEur,
  formatPct,
  normalizeAddress,
  relanceFromSeries,
  relanceOpportunities,
  valueOf,
} from "@/lib/value-evolution/detect";
import type { EstimationRow, ValuePoint } from "@/lib/value-evolution/types";

const TH = { pct: 5, minEur: 5000, minPoints: 2 };

function est(over: Partial<EstimationRow>): EstimationRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    property_id: over.property_id ?? null,
    owner_lead_id: over.owner_lead_id ?? null,
    recommended_price: over.recommended_price ?? null,
    market_value: over.market_value ?? null,
    property: over.property ?? null,
    valued_at: over.valued_at ?? null,
    created_at: over.created_at ?? "2026-01-01T00:00:00Z",
  };
}

function pts(values: number[]): ValuePoint[] {
  return values.map((v, i) => ({
    estimationId: `e${i}`,
    at: `2026-0${i + 1}-01T00:00:00Z`,
    value: v,
    source: "recommended_price" as const,
  }));
}

describe("valueOf", () => {
  it("prioritise recommended_price sur market_value", () => {
    expect(valueOf(est({ recommended_price: 300000, market_value: 280000 }))).toEqual({
      value: 300000,
      source: "recommended_price",
    });
  });
  it("retombe sur market_value si pas de recommended_price", () => {
    expect(valueOf(est({ recommended_price: null, market_value: 280000 }))).toEqual({
      value: 280000,
      source: "market_value",
    });
  });
  it("null si aucune valeur exploitable (0 / négatif / null)", () => {
    expect(valueOf(est({ recommended_price: 0, market_value: null }))).toBeNull();
    expect(valueOf(est({ recommended_price: -1 }))).toBeNull();
    expect(valueOf(est({}))).toBeNull();
  });
});

describe("addressOf / normalizeAddress", () => {
  it("lit adresse depuis le JSON property", () => {
    expect(addressOf(est({ property: { adresse: "12 Rue de la Paix" } }))).toBe("12 Rue de la Paix");
    expect(addressOf(est({ property: { address: "5 Main St" } }))).toBe("5 Main St");
    expect(addressOf(est({ property: null }))).toBeNull();
  });
  it("normalise casse, espaces et accents", () => {
    expect(normalizeAddress("  12  Rue  de l'Évêché ")).toBe("12 rue de l'eveche");
  });
});

describe("computeVariation", () => {
  it("null si moins de MIN_POINTS", () => {
    expect(computeVariation(pts([300000]), TH)).toBeNull();
  });
  it("détecte une hausse significative (+% et +€)", () => {
    const v = computeVariation(pts([300000, 330000]), TH)!;
    expect(v.direction).toBe("up");
    expect(v.deltaEur).toBe(30000);
    expect(v.deltaPct).toBeCloseTo(10, 5);
    expect(v.significant).toBe(true);
  });
  it("détecte une baisse significative", () => {
    const v = computeVariation(pts([400000, 360000]), TH)!;
    expect(v.direction).toBe("down");
    expect(v.deltaEur).toBe(-40000);
    expect(v.significant).toBe(true);
  });
  it("NON significatif si sous le seuil % même si delta € gros", () => {
    // 2M → 2.05M : +2.5% (< 5%) mais +50k€ → doit rester NON significatif
    const v = computeVariation(pts([2_000_000, 2_050_000]), TH)!;
    expect(v.significant).toBe(false);
  });
  it("NON significatif si sous le seuil € même si % gros", () => {
    // 50k → 55k : +10% mais +5000€ pile → limite ; 50k → 54k = +8% mais +4000€ < 5000 → non
    const v = computeVariation(pts([50000, 54000]), TH)!;
    expect(v.deltaPct).toBeCloseTo(8, 5);
    expect(v.significant).toBe(false);
  });
  it("flat si aucun changement", () => {
    const v = computeVariation(pts([300000, 300000]), TH)!;
    expect(v.direction).toBe("flat");
    expect(v.significant).toBe(false);
  });
});

describe("buildSeries", () => {
  it("regroupe par property_id et trie chronologiquement", () => {
    const pid = "11111111-1111-1111-1111-111111111111";
    const rows = [
      est({ id: "b", property_id: pid, recommended_price: 330000, created_at: "2026-03-01T00:00:00Z" }),
      est({ id: "a", property_id: pid, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
    ];
    const series = buildSeries(rows, TH);
    expect(series).toHaveLength(1);
    expect(series[0].points.map((p) => p.estimationId)).toEqual(["a", "b"]);
    expect(series[0].variation!.significant).toBe(true);
    expect(series[0].propertyId).toBe(pid);
  });

  it("regroupe par adresse normalisée quand property_id absent", () => {
    const rows = [
      est({ id: "a", property: { adresse: "12 Rue de la Paix" }, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ id: "b", property: { adresse: "12  RUE de la Paix" }, recommended_price: 340000, created_at: "2026-02-01T00:00:00Z" }),
    ];
    const series = buildSeries(rows, TH);
    expect(series).toHaveLength(1);
    expect(series[0].points).toHaveLength(2);
    expect(series[0].propertyId).toBeNull();
  });

  it("utilise valued_at plutôt que created_at pour l'ordre", () => {
    const pid = "22222222-2222-2222-2222-222222222222";
    const rows = [
      est({ id: "late", property_id: pid, recommended_price: 350000, created_at: "2026-01-01T00:00:00Z", valued_at: "2026-05-01T00:00:00Z" }),
      est({ id: "early", property_id: pid, recommended_price: 300000, created_at: "2026-02-01T00:00:00Z", valued_at: "2026-02-15T00:00:00Z" }),
    ];
    const series = buildSeries(rows, TH);
    expect(series[0].points.map((p) => p.estimationId)).toEqual(["early", "late"]);
    expect(series[0].variation!.direction).toBe("up");
  });

  it("écarte les estimations sans valeur et sans regroupement possible", () => {
    const rows = [
      est({ id: "novalue", property_id: "33333333-3333-3333-3333-333333333333" }),
      est({ id: "noanchor", recommended_price: 300000, property: null }),
    ];
    expect(buildSeries(rows, TH)).toHaveLength(0);
  });

  it("trie les séries significatives en premier, par |%| décroissant", () => {
    const p1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const p2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const p3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const rows = [
      // p1 : +7%
      est({ property_id: p1, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ property_id: p1, recommended_price: 321000, created_at: "2026-02-01T00:00:00Z" }),
      // p2 : +20%
      est({ property_id: p2, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ property_id: p2, recommended_price: 360000, created_at: "2026-02-01T00:00:00Z" }),
      // p3 : +1% (non significatif)
      est({ property_id: p3, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ property_id: p3, recommended_price: 303000, created_at: "2026-02-01T00:00:00Z" }),
    ];
    const series = buildSeries(rows, TH);
    expect(series.map((s) => s.propertyId)).toEqual([p2, p1, p3]);
    expect(series[2].variation!.significant).toBe(false);
  });
});

describe("relanceFromSeries / relanceOpportunities", () => {
  it("génère un brouillon pour une hausse significative, null sinon", () => {
    const sig = buildSeries(
      [
        est({ property_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", owner_lead_id: "lead-1", property: { adresse: "3 Av. Foch" }, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
        est({ property_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", owner_lead_id: "lead-1", property: { adresse: "3 Av. Foch" }, recommended_price: 345000, created_at: "2026-02-01T00:00:00Z" }),
      ],
      TH,
    )[0];
    const r = relanceFromSeries(sig)!;
    expect(r.ownerLeadId).toBe("lead-1");
    expect(r.subject).toContain("progressé");
    expect(r.body).toContain("300");
    expect(r.body).toContain("345");
    expect(r.variation.significant).toBe(true);

    const flat = buildSeries(
      [
        est({ property_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
        est({ property_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", recommended_price: 301000, created_at: "2026-02-01T00:00:00Z" }),
      ],
      TH,
    )[0];
    expect(relanceFromSeries(flat)).toBeNull();
  });

  it("relanceOpportunities ne renvoie que les séries significatives", () => {
    const p1 = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const p2 = "99999999-9999-9999-9999-999999999999";
    const rows = [
      est({ property_id: p1, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ property_id: p1, recommended_price: 400000, created_at: "2026-02-01T00:00:00Z" }),
      est({ property_id: p2, recommended_price: 300000, created_at: "2026-01-01T00:00:00Z" }),
      est({ property_id: p2, recommended_price: 300500, created_at: "2026-02-01T00:00:00Z" }),
    ];
    const opps = relanceOpportunities(buildSeries(rows, TH));
    expect(opps).toHaveLength(1);
    expect(opps[0].propertyId).toBe(p1);
  });
});

describe("formatters", () => {
  it("formatPct signe et arrondit", () => {
    expect(formatPct(6.44)).toContain("+");
    expect(formatPct(-5)).toContain("−");
    expect(formatPct(0)).not.toContain("+");
  });
  it("formatDeltaEur signe", () => {
    expect(formatDeltaEur(12000)).toContain("+");
    expect(formatDeltaEur(-12000)).toContain("−");
  });
});
