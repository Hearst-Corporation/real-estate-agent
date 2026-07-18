import { describe, it, expect } from "vitest";
import {
  buildActivity,
  buildFeedback,
  buildActions,
  buildOwnerReport,
  type VisitRow,
  type BroadcastRow,
  type TaskRow,
} from "./aggregate";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function visit(p: Partial<VisitRow>): VisitRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    status: p.status ?? "planifiee",
    scheduled_at: p.scheduled_at ?? "2026-07-01T10:00:00.000Z",
    feedback: p.feedback ?? null,
    notes: p.notes ?? null,
    created_at: p.created_at ?? "2026-06-30T10:00:00.000Z",
  };
}

function broadcast(p: Partial<BroadcastRow>): BroadcastRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    source: p.source ?? "leboncoin",
    actif: p.actif ?? true,
    date_publication: p.date_publication ?? "2026-06-25T09:00:00.000Z",
    created_at: p.created_at ?? "2026-06-25T09:00:00.000Z",
  };
}

function task(p: Partial<TaskRow>): TaskRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    title: p.title ?? "Relancer le propriétaire",
    kind: p.kind ?? "relance",
    status: p.status ?? "a_faire",
    priority: p.priority ?? "normale",
    due_at: p.due_at ?? null,
    notes: p.notes ?? null,
    created_at: p.created_at ?? "2026-07-10T10:00:00.000Z",
  };
}

describe("buildActivity", () => {
  it("compte visites par statut et diffusions actives depuis des données réelles", () => {
    const a = buildActivity(
      [
        visit({ status: "realisee", scheduled_at: "2026-07-05T10:00:00.000Z" }),
        visit({ status: "realisee" }),
        visit({ status: "planifiee", scheduled_at: "2026-07-20T10:00:00.000Z" }),
        visit({ status: "annulee" }),
      ],
      [broadcast({ actif: true }), broadcast({ actif: false })],
    );
    expect(a.visitsTotal).toBe(4);
    expect(a.visitsDone).toBe(2);
    expect(a.visitsUpcoming).toBe(1);
    expect(a.broadcastsTotal).toBe(2);
    expect(a.broadcastsActive).toBe(1);
    expect(a.empty).toBe(false);
    // dernière activité = la visite planifiée au 20/07 (la plus récente)
    expect(a.lastActivityAt).toBe("2026-07-20T10:00:00.000Z");
  });

  it("est empty et honnête sans aucune donnée", () => {
    const a = buildActivity([], []);
    expect(a.empty).toBe(true);
    expect(a.visitsTotal).toBe(0);
    expect(a.broadcastsTotal).toBe(0);
    expect(a.lastActivityAt).toBeNull();
  });
});

describe("buildFeedback", () => {
  it("synthétise les CR de visites réalisées, plus récent d'abord", () => {
    const f = buildFeedback([
      visit({
        id: "v1",
        status: "realisee",
        scheduled_at: "2026-07-01T10:00:00.000Z",
        feedback: "Trop cher pour le quartier.",
      }),
      visit({
        id: "v2",
        status: "realisee",
        scheduled_at: "2026-07-10T10:00:00.000Z",
        notes: "Cuisine à refaire.",
      }),
      visit({ status: "planifiee", feedback: "ignoré car pas réalisée" }),
    ]);
    expect(f.available).toBe(true);
    expect(f.items).toHaveLength(2);
    expect(f.items[0].visitId).toBe("v2"); // plus récent
    expect(f.items[1].text).toContain("Trop cher");
    expect(f.missingReports).toBe(0);
  });

  it("UNAVAILABLE honnête si visites réalisées sans CR, compte les manquants", () => {
    const f = buildFeedback([
      visit({ status: "realisee", feedback: null, notes: null }),
      visit({ status: "realisee", feedback: "   ", notes: null }),
    ]);
    expect(f.available).toBe(false);
    expect(f.items).toHaveLength(0);
    expect(f.missingReports).toBe(2);
  });
});

describe("buildActions", () => {
  it("garde tâches ouvertes (future/sans échéance) et visites futures, triées", () => {
    const r = buildActions(
      [
        task({ id: "t-past", status: "a_faire", due_at: "2026-07-01T10:00:00.000Z" }),
        task({ id: "t-future", status: "a_faire", due_at: "2026-07-25T10:00:00.000Z" }),
        task({ id: "t-nodate", status: "en_cours", due_at: null }),
        task({ id: "t-done", status: "termine", due_at: "2026-07-25T10:00:00.000Z" }),
      ],
      [
        visit({ id: "v-future", status: "confirmee", scheduled_at: "2026-07-19T10:00:00.000Z" }),
        visit({ id: "v-past", status: "planifiee", scheduled_at: "2026-07-01T10:00:00.000Z" }),
      ],
      NOW,
    );
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain("t-future");
    expect(ids).toContain("t-nodate");
    expect(ids).toContain("v-future");
    expect(ids).not.toContain("t-past"); // échéance passée
    expect(ids).not.toContain("t-done"); // statut clos
    expect(ids).not.toContain("v-past"); // visite passée
    // tri : v-future (19) avant t-future (25), sans-date en fin
    expect(r.items[0].id).toBe("v-future");
    expect(r.items[r.items.length - 1].id).toBe("t-nodate");
    expect(r.empty).toBe(false);
  });

  it("empty si rien d'à venir", () => {
    const r = buildActions([], [], NOW);
    expect(r.empty).toBe(true);
    expect(r.items).toHaveLength(0);
  });
});

describe("buildOwnerReport", () => {
  it("assemble les 3 blocs depuis les données réelles", () => {
    const report = buildOwnerReport({
      visits: [visit({ status: "realisee", feedback: "RAS" })],
      broadcasts: [broadcast({ actif: true })],
      tasks: [task({ status: "a_faire", due_at: "2026-07-25T10:00:00.000Z" })],
      now: NOW,
    });
    expect(report.activity.visitsTotal).toBe(1);
    expect(report.feedback.available).toBe(true);
    expect(report.actions.items).toHaveLength(1);
  });
});
