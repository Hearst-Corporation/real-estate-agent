// lib/timeline/aggregate.test.ts — Agrégation + tri PURS sur fixtures.
import { describe, expect, it } from "vitest";
import { buildTimeline } from "./aggregate";
import { relativeFr } from "./relative";
import type { TimelineSources } from "./types";

const sources: TimelineSources = {
  visits: [
    {
      id: "v1",
      scheduled_at: "2026-03-10T14:00:00.000Z",
      created_at: "2026-03-01T09:00:00.000Z",
      status: "planifiee",
      duration_min: 45,
      feedback: "Client intéressé",
      notes: null,
      property_id: "p1",
      lead_id: "l1",
    },
  ],
  estimations: [
    {
      id: "e1",
      created_at: "2026-02-01T10:00:00.000Z",
      valued_at: "2026-02-02T10:00:00.000Z",
      updated_at: null,
      status: "valued",
      city: "Lyon",
      market_value: 320000,
      recommended_price: 335000,
      property_id: "p1",
      owner_lead_id: "l1",
    },
  ],
  estimationMessages: [
    {
      id: "m1",
      created_at: "2026-02-01T10:05:00.000Z",
      role: "assistant",
      content: "Voici la fourchette de prix pour ce bien.",
      estimation_id: "e1",
    },
  ],
  mandates: [
    {
      id: "md1",
      created_at: "2026-01-15T08:00:00.000Z",
      signed_at: "2026-01-20T08:00:00.000Z",
      status: "actif",
      kind: "exclusif",
      reference: "MDT-001",
      asking_price: 340000,
      property_id: "p1",
    },
  ],
  contactAttempts: [
    {
      id: "c1",
      created_at: "2026-04-01T12:00:00.000Z",
      sent_at: "2026-04-01T12:00:01.000Z",
      canal: "whatsapp",
      statut: "envoye",
      provider: "twilio",
      error: null,
      lead_id: "l1",
    },
  ],
};

describe("buildTimeline", () => {
  it("agrège toutes les sources en un flux unique", () => {
    const events = buildTimeline(sources);
    // 1 visite + 1 estimation + 1 message + 1 mandat + 1 contact = 5
    expect(events).toHaveLength(5);
    const kinds = events.map((e) => e.kind).sort();
    expect(kinds).toEqual([
      "contact_attempt",
      "estimation",
      "estimation_message",
      "mandate",
      "visit",
    ]);
  });

  it("trie par date d'événement décroissante (ts réel)", () => {
    const events = buildTimeline(sources);
    const ts = events.map((e) => e.ts);
    const sorted = [...ts].sort((a, b) => Date.parse(b) - Date.parse(a));
    expect(ts).toEqual(sorted);
    // Le contact (avril) est le plus récent, le mandat (janvier) le plus ancien.
    expect(events[0].kind).toBe("contact_attempt");
    expect(events[events.length - 1].kind).toBe("mandate");
  });

  it("utilise l'horodatage réel de l'événement (scheduled_at, valued_at, signed_at, sent_at)", () => {
    const events = buildTimeline(sources);
    const byKind = Object.fromEntries(events.map((e) => [e.kind, e]));
    expect(byKind.visit.ts).toBe("2026-03-10T14:00:00.000Z"); // scheduled_at
    expect(byKind.estimation.ts).toBe("2026-02-02T10:00:00.000Z"); // valued_at
    expect(byKind.mandate.ts).toBe("2026-01-20T08:00:00.000Z"); // signed_at
    expect(byKind.contact_attempt.ts).toBe("2026-04-01T12:00:01.000Z"); // sent_at
  });

  it("titre reflète l'état réel (valorisée vs créée, signé vs créé)", () => {
    const events = buildTimeline(sources);
    const est = events.find((e) => e.kind === "estimation")!;
    expect(est.title).toBe("Estimation valorisée");
    const mandate = events.find((e) => e.kind === "mandate")!;
    expect(mandate.title).toBe("Mandat signé");
  });

  it("écarte les lignes sans horodatage exploitable (aucun événement fantôme)", () => {
    const bad: TimelineSources = {
      visits: [
        {
          id: "vX",
          scheduled_at: "",
          created_at: "not-a-date",
          status: null,
          duration_min: null,
          feedback: null,
          notes: null,
          property_id: null,
          lead_id: null,
        },
      ],
    };
    expect(buildTimeline(bad)).toHaveLength(0);
  });

  it("retourne un flux vide sur sources vides (empty honnête)", () => {
    expect(buildTimeline({})).toEqual([]);
  });

  it("respecte la borne limit", () => {
    const many: TimelineSources = {
      visits: Array.from({ length: 10 }, (_, i) => ({
        id: `v${i}`,
        scheduled_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
        created_at: "2026-01-01T00:00:00.000Z",
        status: "planifiee",
        duration_min: 30,
        feedback: null,
        notes: null,
        property_id: "p1",
        lead_id: null,
      })),
    };
    expect(buildTimeline(many, 3)).toHaveLength(3);
  });

  it("tronque les résumés trop longs et normalise les espaces", () => {
    const long: TimelineSources = {
      visits: [
        {
          id: "vL",
          scheduled_at: "2026-05-01T10:00:00.000Z",
          created_at: "2026-05-01T10:00:00.000Z",
          status: "planifiee",
          duration_min: null,
          feedback: "x".repeat(300),
          notes: null,
          property_id: "p1",
          lead_id: null,
        },
      ],
    };
    const [ev] = buildTimeline(long);
    expect(ev.summary!.length).toBeLessThanOrEqual(160);
    expect(ev.summary!.endsWith("…")).toBe(true);
  });
});

describe("relativeFr", () => {
  const now = Date.parse("2026-05-01T12:00:00.000Z");
  it("à l'instant sous 60 s", () => {
    expect(relativeFr("2026-05-01T11:59:30.000Z", now)).toBe("à l'instant");
  });
  it("minutes / heures / jours passés", () => {
    expect(relativeFr("2026-05-01T11:30:00.000Z", now)).toBe("il y a 30 min");
    expect(relativeFr("2026-05-01T09:00:00.000Z", now)).toBe("il y a 3 h");
    expect(relativeFr("2026-04-26T12:00:00.000Z", now)).toBe("il y a 5 j");
  });
  it("date absolue au-delà de 30 j", () => {
    expect(relativeFr("2026-01-01T12:00:00.000Z", now)).toMatch(/2026/);
  });
  it("— sur date invalide", () => {
    expect(relativeFr("nope", now)).toBe("—");
  });
});
