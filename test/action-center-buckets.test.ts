/**
 * Hiérarchie temporelle du centre d'actions (urgent → aujourd'hui → ensuite).
 *
 * Avant : le tri global priorité-first faisait remonter une opportunité « haute »
 * (bande « ensuite », ex. estimation/mandat) AU-DESSUS d'un RDV du jour « normale »
 * (bande « aujourd'hui ») → la lecture temporelle était diluée. Le tri est
 * désormais bande-first : tout l'urgent précède tout le jour, qui précède le reste.
 * On verrouille cette invariance ici.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionCenter,
  bucketOf,
  BUCKET_ORDER,
  type DeriveInput,
  type DeriveLabels,
} from "@/lib/actions/derive";

const L: DeriveLabels = {
  staleFor: (n) => `stale ${n}`,
  visitWith: (w) => `avec ${w}`,
  today: "aujourd'hui",
  rdvOn: (w) => `rdv ${w}`,
  estimationResume: "reprendre",
  acquereurNoProposal: "sans proposition",
  matchToReview: (s) => `match ${s}`,
  proprietaireToCall: "à rappeler",
  mandateDraft: "brouillon",
  taskDue: "due",
  taskOverdue: "échue",
  taskOpen: "ouverte",
  validationNeeded: "à valider",
  fallbackLead: "Lead",
  fallbackProperty: "Bien",
  fallbackEstimation: "Estimation",
  fallbackMandate: "Mandat",
  fallbackCritere: "Critère",
};

const NOW = new Date("2026-07-17T12:00:00Z").getTime();

function emptyInput(): DeriveInput {
  return { tasks: [], leads: [], visits: [], estimations: [], mandates: [], criteres: [], matchs: [] };
}

describe("bucketOf — projection catégorie → bande temporelle", () => {
  it("mappe overdue→urgent, today/validation→today, le reste→next", () => {
    expect(bucketOf("overdue")).toBe("urgent");
    expect(bucketOf("today")).toBe("today");
    expect(bucketOf("validation")).toBe("today");
    for (const c of ["task", "rdv", "relance", "proprietaire", "mandat", "estimation", "acquereur", "match"] as const) {
      expect(bucketOf(c)).toBe("next");
    }
  });
});

describe("buildActionCenter — tri par bande temporelle d'abord", () => {
  it("tout l'urgent précède tout le jour, qui précède tout le reste", () => {
    const input = emptyInput();
    // Une tâche échue (urgent) + une tâche du jour (aujourd'hui).
    input.tasks = [
      {
        id: "task-overdue",
        entity_type: "lead",
        entity_id: "lead-1",
        kind: "suivi",
        title: "Échue",
        priority: "normale",
        due_at: "2026-07-10T09:00:00Z", // < NOW → overdue
        status: "open",
        snoozed_until: null,
        notes: null,
      },
      {
        id: "task-today",
        entity_type: "lead",
        entity_id: "lead-2",
        kind: "suivi",
        title: "Aujourd'hui",
        priority: "normale",
        due_at: "2026-07-17T15:00:00Z", // même jour que NOW, ≥ NOW → today
        status: "open",
        snoozed_until: null,
        notes: null,
      },
    ];
    // Un mandat brouillon = priorité HAUTE mais bande « ensuite ».
    input.mandates = [
      {
        id: "mandate-1",
        reference: "M-1",
        status: "brouillon",
        expires_at: null,
        properties: { title: "Villa", city: "Nice" },
      },
    ];

    const { items } = buildActionCenter(input, NOW, L);
    const bucketsSeq = items.map((i) => bucketOf(i.category));

    // Le mandat « haute » ne doit PAS remonter avant le jour/urgent.
    const rank = { urgent: 0, today: 1, next: 2 } as const;
    for (let i = 1; i < bucketsSeq.length; i++) {
      expect(rank[bucketsSeq[i]]).toBeGreaterThanOrEqual(rank[bucketsSeq[i - 1]]);
    }

    // Vérité concrète : overdue en 1er, today ensuite, mandat (next) en dernier.
    // (les items dérivés d'un mandat portent l'id `mandat:<id>`).
    const idx = (id: string) => items.findIndex((i) => i.id === id);
    expect(idx("task-overdue")).toBeGreaterThanOrEqual(0);
    expect(idx("mandat:mandate-1")).toBeGreaterThanOrEqual(0);
    expect(idx("task-overdue")).toBeLessThan(idx("task-today"));
    expect(idx("task-today")).toBeLessThan(idx("mandat:mandate-1"));
  });

  it("BUCKET_ORDER est bien urgent → today → next", () => {
    expect(BUCKET_ORDER).toEqual(["urgent", "today", "next"]);
  });
});
