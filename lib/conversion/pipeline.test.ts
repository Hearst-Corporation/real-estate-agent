// lib/conversion/pipeline.test.ts — Calcul pipeline / délais / pertes sur fixtures.
import { describe, expect, it } from "vitest";
import { computeConversion, statusRank } from "./pipeline";
import { periodBounds, periodLabel } from "./period";
import type { ConversionSources } from "./types";

const OPTS = { segment: "all" as const, grain: "month" as const, from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };

// Fixture : 6 leads acheteurs/vendeurs à divers étages, 1 estimation, 2 visites, 1 mandat.
const sources: ConversionSources = {
  leads: [
    { id: "l1", status: "nouveau", kind: "acheteur", created_at: "2026-01-02T09:00:00Z", updated_at: "2026-01-02T09:00:00Z" },
    { id: "l2", status: "qualifie", kind: "acheteur", created_at: "2026-01-03T09:00:00Z", updated_at: "2026-01-05T09:00:00Z" },
    { id: "l3", status: "visite", kind: "vendeur", created_at: "2026-01-04T09:00:00Z", updated_at: "2026-01-10T09:00:00Z" },
    { id: "l4", status: "offre", kind: "vendeur", created_at: "2026-01-05T09:00:00Z", updated_at: "2026-01-15T09:00:00Z" },
    { id: "l5", status: "gagne", kind: "acheteur", created_at: "2026-01-06T09:00:00Z", updated_at: "2026-01-16T09:00:00Z" },
    { id: "l6", status: "perdu", kind: "vendeur", created_at: "2026-01-07T09:00:00Z", updated_at: "2026-01-08T09:00:00Z" },
  ],
  estimations: [
    { id: "e1", status: "final", created_at: "2026-01-05T09:00:00Z", owner_lead_id: "l2" }, // relève l2 en engaged
  ],
  visits: [
    { id: "v1", status: "realisee", created_at: "2026-01-08T09:00:00Z", scheduled_at: "2026-01-09T09:00:00Z", lead_id: "l3" },
    { id: "v2", status: "planifiee", created_at: "2026-01-09T09:00:00Z", scheduled_at: "2026-01-11T09:00:00Z", lead_id: "l6" }, // non réalisée → n'engage pas
  ],
  mandates: [
    { id: "m1", status: "actif", created_at: "2026-01-06T09:00:00Z", signed_at: "2026-01-06T09:00:00Z" },
  ],
};

describe("statusRank", () => {
  it("ordonne les statuts et isole perdu/inconnu", () => {
    expect(statusRank("nouveau")).toBe(0);
    expect(statusRank("gagne")).toBe(5);
    expect(statusRank("perdu")).toBe(-1);
    expect(statusRank("wat")).toBe(-2);
  });
});

describe("computeConversion — funnel", () => {
  const r = computeConversion(sources, OPTS);

  it("compte le funnel cumulatif décroissant sur les leads réels", () => {
    const byId = Object.fromEntries(r.stages.map((s) => [s.id, s.count]));
    // prospect = tous sauf le perdu (le perdu a rank -1) → 5
    expect(byId.prospect).toBe(5);
    // qualified (rank>=2) : l2(qual),l3(visite),l4(offre),l5(gagne) = 4
    expect(byId.qualified).toBe(4);
    // engaged (rank>=3) : l3,l4,l5 + l2 relevé par estimation = 4
    expect(byId.engaged).toBe(4);
    // proposal (rank>=4) : l4,l5 = 2
    expect(byId.proposal).toBe(2);
    // won : l5 = 1
    expect(byId.won).toBe(1);
  });

  it("est monotone décroissant", () => {
    const counts = r.stages.map((s) => s.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
  });

  it("calcule taux de passage et cumulatif", () => {
    const won = r.stages.find((s) => s.id === "won")!;
    expect(won.cumulativeRate).toBeCloseTo(1 / 5, 5);
    const qualified = r.stages.find((s) => s.id === "qualified")!;
    expect(qualified.stepRate).toBeCloseTo(4 / 5, 5);
    expect(r.stages[0].stepRate).toBeNull();
  });

  it("expose des hrefs de navigation filtrés réels", () => {
    const won = r.stages.find((s) => s.id === "won")!;
    expect(won.href).toContain("/leads?");
    expect(won.href).toContain("status=gagne");
  });

  it("calcule winRate et lossRate globaux sur tous les prospects entrés", () => {
    // totalLeads = 6 (le perdu compte comme prospect entré) → 1 gagné, 1 perdu.
    expect(r.totalLeads).toBe(6);
    expect(r.winRate).toBeCloseTo(1 / 6, 5);
    expect(r.lossRate).toBeCloseTo(1 / 6, 5);
  });
});

describe("computeConversion — segmentation par type", () => {
  it("filtre par kind acheteur", () => {
    const r = computeConversion(sources, { ...OPTS, segment: "acheteur" });
    // acheteurs = l1,l2,l5 → prospect 3, won 1
    expect(r.stages.find((s) => s.id === "prospect")!.count).toBe(3);
    expect(r.stages.find((s) => s.id === "won")!.count).toBe(1);
  });
  it("filtre par kind vendeur (l6 perdu exclu du sommet)", () => {
    const r = computeConversion(sources, { ...OPTS, segment: "vendeur" });
    // vendeurs = l3,l4,l6(perdu) → prospect 2, won 0, lossRate 1/3
    expect(r.stages.find((s) => s.id === "prospect")!.count).toBe(2);
    expect(r.stages.find((s) => s.id === "won")!.count).toBe(0);
    expect(r.lossRate).toBeCloseTo(1 / 3, 5);
  });
});

describe("computeConversion — délais", () => {
  const r = computeConversion(sources, OPTS);
  it("mesure le délai médian entrée→engagement sur paires réelles", () => {
    const d = r.delays.find((x) => x.toStatus === "engage")!;
    // l2: created 01-03 → estimation 01-05 = 2j ; l3: created 01-04 → visite réalisée scheduled 01-09 = 5j
    expect(d.sample).toBe(2);
    expect(d.medianDays).toBeCloseTo((2 + 5) / 2, 5);
  });
  it("mesure le délai engagement→gain sur les leads gagnés", () => {
    const d = r.delays.find((x) => x.toStatus === "gagne")!;
    // l5: created 01-06 → updated 01-16 = 10j
    expect(d.sample).toBe(1);
    expect(d.medianDays).toBe(10);
  });
  it("renvoie null sans échantillon", () => {
    const r2 = computeConversion({ leads: [], estimations: [], visits: [], mandates: [] }, OPTS);
    expect(r2.delays.every((d) => d.medianDays === null && d.sample === 0)).toBe(true);
  });
});

describe("computeConversion — pertes", () => {
  const r = computeConversion(sources, OPTS);
  it("répartit les leads perdus par étage atteint", () => {
    const total = r.losses.reduce((n, l) => n + l.lost, 0);
    expect(total).toBe(1); // 1 seul perdu (l6, visite non réalisée → prospect)
    const prospect = r.losses.find((l) => l.stage === "prospect")!;
    expect(prospect.lost).toBe(1);
    expect(prospect.share).toBeCloseTo(1, 5);
  });
});

describe("periodBounds / periodLabel", () => {
  const ref = new Date("2026-05-15T12:00:00.000Z");
  it("borne le mois courant", () => {
    const { from, to } = periodBounds({ grain: "month", offset: 0 }, ref);
    expect(from).toBe("2026-05-01T00:00:00.000Z");
    expect(to).toBe("2026-06-01T00:00:00.000Z");
  });
  it("borne le mois précédent", () => {
    const { from, to } = periodBounds({ grain: "month", offset: 1 }, ref);
    expect(from).toBe("2026-04-01T00:00:00.000Z");
    expect(to).toBe("2026-05-01T00:00:00.000Z");
  });
  it("borne le trimestre courant (T2 = avr-juin)", () => {
    const { from, to } = periodBounds({ grain: "quarter", offset: 0 }, ref);
    expect(from).toBe("2026-04-01T00:00:00.000Z");
    expect(to).toBe("2026-07-01T00:00:00.000Z");
  });
  it("étiquette le trimestre", () => {
    expect(periodLabel({ grain: "quarter", offset: 0 }, ref)).toBe("T2 2026");
  });
});
