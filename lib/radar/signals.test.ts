import { describe, it, expect } from "vitest";
import {
  computePriceDrops,
  computeDormant,
  computeMandateExpiries,
  daysBetween,
  daysUntil,
  type AnnonceVersionRow,
  type AnnonceRow,
  type MandateRow,
} from "./signals";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}
function inDays(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

describe("daysBetween / daysUntil", () => {
  it("counts elapsed days floored", () => {
    expect(daysBetween(daysAgo(10), NOW)).toBe(10);
    expect(daysBetween(NOW, NOW)).toBe(0);
  });
  it("handles bad input as 0", () => {
    expect(daysBetween("not-a-date", NOW)).toBe(0);
  });
  it("counts remaining days (ceil), negative if past", () => {
    expect(daysUntil(inDays(5), NOW)).toBe(5);
    expect(daysUntil(daysAgo(3), NOW)).toBeLessThan(0);
  });
});

describe("computePriceDrops", () => {
  const meta = new Map([
    ["a1", { titre: "T3 Lyon", ville: "Lyon", url: "http://x/1" }],
  ]);

  it("detects a real drop between the two latest versions", () => {
    const versions: AnnonceVersionRow[] = [
      { annonce_id: "a1", prix: 300000, observed_at: daysAgo(20) },
      { annonce_id: "a1", prix: 280000, observed_at: daysAgo(2) },
      { annonce_id: "a1", prix: 310000, observed_at: daysAgo(40) },
    ];
    const [s] = computePriceDrops(versions, meta);
    expect(s.prix_actuel).toBe(280000);
    expect(s.prix_precedent).toBe(300000);
    expect(s.drop_eur).toBe(20000);
    expect(s.drop_pct).toBeCloseTo(6.7, 1);
    expect(s.titre).toBe("T3 Lyon");
  });

  it("ignores a price increase", () => {
    const versions: AnnonceVersionRow[] = [
      { annonce_id: "a2", prix: 200000, observed_at: daysAgo(10) },
      { annonce_id: "a2", prix: 220000, observed_at: daysAgo(1) },
    ];
    expect(computePriceDrops(versions, meta)).toHaveLength(0);
  });

  it("ignores annonces with a single version", () => {
    const versions: AnnonceVersionRow[] = [
      { annonce_id: "a3", prix: 100000, observed_at: daysAgo(5) },
    ];
    expect(computePriceDrops(versions, meta)).toHaveLength(0);
  });

  it("sorts by strongest pct drop first", () => {
    const versions: AnnonceVersionRow[] = [
      { annonce_id: "small", prix: 100000, observed_at: daysAgo(10) },
      { annonce_id: "small", prix: 95000, observed_at: daysAgo(1) }, // -5%
      { annonce_id: "big", prix: 100000, observed_at: daysAgo(10) },
      { annonce_id: "big", prix: 80000, observed_at: daysAgo(1) }, // -20%
    ];
    const res = computePriceDrops(versions, new Map());
    expect(res[0].annonce_id).toBe("big");
    expect(res[1].annonce_id).toBe("small");
  });
});

describe("computeDormant", () => {
  function annonce(over: Partial<AnnonceRow>): AnnonceRow {
    return {
      id: "x",
      titre: null,
      ville: null,
      url: null,
      prix: null,
      actif: true,
      date_modif: null,
      date_publication: null,
      created_at: daysAgo(1),
      ...over,
    };
  }

  it("flags an active annonce untouched past the threshold", () => {
    const [s] = computeDormant([annonce({ id: "d1", date_modif: daysAgo(90) })], NOW);
    expect(s.annonce_id).toBe("d1");
    expect(s.jours_dormant).toBe(90);
  });

  it("skips fresh annonces", () => {
    expect(computeDormant([annonce({ date_modif: daysAgo(5) })], NOW)).toHaveLength(0);
  });

  it("skips inactive annonces even if old", () => {
    expect(computeDormant([annonce({ actif: false, date_modif: daysAgo(200) })], NOW)).toHaveLength(0);
  });

  it("falls back date_modif → date_publication → created_at", () => {
    const [s] = computeDormant([annonce({ date_modif: null, date_publication: daysAgo(120) })], NOW);
    expect(s.jours_dormant).toBe(120);
  });

  it("sorts oldest first", () => {
    const res = computeDormant(
      [annonce({ id: "old", date_modif: daysAgo(200) }), annonce({ id: "newish", date_modif: daysAgo(70) })],
      NOW,
    );
    expect(res[0].annonce_id).toBe("old");
  });
});

describe("computeMandateExpiries", () => {
  function mandate(over: Partial<MandateRow>): MandateRow {
    return {
      id: "m",
      reference: null,
      kind: "exclusif",
      status: "active",
      property_id: null,
      asking_price: null,
      expires_at: null,
      ...over,
    };
  }

  it("flags an active mandate expiring within the window", () => {
    const [s] = computeMandateExpiries([mandate({ id: "m1", expires_at: inDays(10) })], NOW);
    expect(s.mandate_id).toBe("m1");
    expect(s.jours_restants).toBe(10);
  });

  it("includes recently expired ones (negative days)", () => {
    const [s] = computeMandateExpiries([mandate({ expires_at: daysAgo(2) })], NOW);
    expect(s.jours_restants).toBeLessThan(0);
  });

  it("skips mandates expiring beyond the window", () => {
    expect(computeMandateExpiries([mandate({ expires_at: inDays(90) })], NOW)).toHaveLength(0);
  });

  it("skips non-active statuses", () => {
    expect(computeMandateExpiries([mandate({ status: "cancelled", expires_at: inDays(5) })], NOW)).toHaveLength(0);
  });

  it("skips mandates without expires_at", () => {
    expect(computeMandateExpiries([mandate({ expires_at: null })], NOW)).toHaveLength(0);
  });

  it("sorts soonest expiry first", () => {
    const res = computeMandateExpiries(
      [mandate({ id: "later", expires_at: inDays(20) }), mandate({ id: "soon", expires_at: inDays(2) })],
      NOW,
    );
    expect(res[0].mandate_id).toBe("soon");
  });
});
