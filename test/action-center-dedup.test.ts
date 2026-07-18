/**
 * Régression : le centre d'actions ne doit JAMAIS produire deux items avec le
 * même `id` (clé React unique). Bug vécu (2026-07-17, page `/`) : une tâche
 * `kind=validation` ET échue est surfacée par deriveValidationTasks ET
 * deriveOverdueTasks → deux items `id = t.id` (UUID nu) → console error React
 * « Encountered two children with the same key ».
 *
 * Le fix (buildActionCenter, dédup 2 par id) garde la PREMIÈRE occurrence, la
 * plus urgente selon l'ordre des catégories (overdue avant validation).
 */
import { describe, it, expect } from "vitest";
import { buildActionCenter, type DeriveInput, type DeriveLabels } from "@/lib/actions/derive";

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

describe("buildActionCenter — unicité des ids (régression clé React)", () => {
  it("une tâche validation ÉCHUE n'apparaît qu'une fois (pas de doublon d'id)", () => {
    const input = emptyInput();
    input.tasks = [
      {
        id: "adf0e762-96ab-44c8-9435-5a6bda287758",
        entity_type: "lead",
        entity_id: "11111111-1111-4111-8111-111111111111",
        kind: "validation",
        title: "Valider l'estimation",
        priority: "haute",
        // Échue (avant NOW) ET kind=validation → matche overdue ET validation.
        due_at: "2026-07-10T09:00:00Z",
        status: "open",
        snoozed_until: null,
        notes: null,
      },
    ];

    const { items } = buildActionCenter(input, NOW, L);

    // Exactement UN item pour cette tâche.
    const forTask = items.filter((i) => i.id === "adf0e762-96ab-44c8-9435-5a6bda287758");
    expect(forTask).toHaveLength(1);
    // La 1re occurrence (la plus urgente) est conservée : catégorie "overdue".
    expect(forTask[0].category).toBe("overdue");

    // Invariant global : aucun id dupliqué dans tout le centre d'actions.
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("invariant : aucun id dupliqué même avec un mix tâches/visites/leads recouvrants", () => {
    const input = emptyInput();
    input.tasks = [
      {
        id: "task-A",
        entity_type: "lead",
        entity_id: "lead-1",
        kind: "validation",
        title: "T A",
        priority: "haute",
        due_at: "2026-07-01T09:00:00Z", // échue + validation → double catégorie
        status: "open",
        snoozed_until: null,
        notes: null,
      },
      {
        id: "task-B",
        entity_type: "property",
        entity_id: "prop-1",
        kind: "suivi",
        title: "T B",
        priority: "normale",
        due_at: null, // ouverte sans échéance → catégorie "task" seule
        status: "open",
        snoozed_until: null,
        notes: null,
      },
    ];
    // Une visite aujourd'hui → surfacée en "today", retirée de "rdv" (dédup 1).
    input.visits = [
      {
        id: "visit-1",
        scheduled_at: "2026-07-17T15:00:00Z",
        status: "planifie",
        property_id: "prop-1",
        lead_id: "lead-1",
        properties: { title: "Bien", city: "Nice" },
        leads: { full_name: "Alice" },
      },
    ];

    const { items } = buildActionCenter(input, NOW, L);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // task-A conservée une fois (overdue), task-B une fois (task).
    expect(items.filter((i) => i.id === "task-A")).toHaveLength(1);
    expect(items.filter((i) => i.id === "task-B")).toHaveLength(1);
  });
});
