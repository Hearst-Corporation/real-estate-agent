/**
 * Checklist de démarrage (W6) — dérivation RÉELLE + dégradation honnête.
 *
 * Deux garanties couvertes ici :
 *   1. la complétion vient des DONNÉES (comptages owner-scopés / progression du
 *      tour), jamais d'une case cochée ;
 *   2. une table absente produit « indéterminé », jamais « fait » ni « à faire »,
 *      et empêche la checklist de se déclarer terminée.
 *
 * On vérifie aussi que les sondes sont en LECTURE SEULE et owner-scopées : le
 * faux client enregistre chaque appel et échoue si une mutation est tentée.
 */

import { describe, expect, it } from "vitest";
import {
  ACTION_CENTER_STEP_ID,
  ACTION_CENTER_TOUR_KEY,
  CHECKLIST_ITEM_IDS,
  COUNT_CAP,
  actionCenterItem,
  actionCenterStepIndex,
  capCount,
  hasSeenActionCenter,
  itemFromProbe,
  mergeLocalActionCenter,
  summarize,
  type ChecklistItem,
} from "./checklist";
import { buildChecklist, CHECKLIST_SOURCES, DB_DERIVED_ITEM_IDS } from "./checklist-db";
import type { TourDefinition } from "./types";

/* ------------------------------------------------------------------ */
/* Faux client PostgREST — lecture seule, traçable                      */
/* ------------------------------------------------------------------ */

interface Call {
  table: string;
  columns: string;
  head: boolean;
  count?: string;
  filters: Array<[string, unknown]>;
  limit: number | null;
}

type TableOutcome = { count: number } | { errorCode: string };

function makeDb(outcomes: Record<string, TableOutcome>) {
  const calls: Call[] = [];

  function from(table: string) {
    const call: Call = { table, columns: "", head: false, filters: [], limit: null };

    const builder = {
      select(columns: string, opts?: { count?: string; head?: boolean }) {
        call.columns = columns;
        call.count = opts?.count;
        call.head = Boolean(opts?.head);
        calls.push(call);
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        call.limit = n;
        return builder;
      },
      // Toute mutation fait échouer le test : la checklist LIT, elle n'écrit pas.
      insert: () => { throw new Error(`mutation interdite: insert sur ${table}`); },
      update: () => { throw new Error(`mutation interdite: update sur ${table}`); },
      upsert: () => { throw new Error(`mutation interdite: upsert sur ${table}`); },
      delete: () => { throw new Error(`mutation interdite: delete sur ${table}`); },
      then(resolve: (r: unknown) => unknown) {
        const outcome = outcomes[table] ?? { count: 0 };
        const result =
          "errorCode" in outcome
            ? { data: null, count: null, error: { code: outcome.errorCode } }
            : {
                // La lecture de progression renvoie des lignes, les sondes un compteur.
                data: table === "user_product_tour_progress" ? [] : null,
                count: outcome.count,
                error: null,
              };
        return Promise.resolve(result).then(resolve);
      },
    };
    return builder;
  }

  return { db: { from } as never, calls };
}

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

/* ------------------------------------------------------------------ */
/* Logique pure                                                         */
/* ------------------------------------------------------------------ */

describe("checklist — dérivation depuis les données réelles", () => {
  it("un compte non nul rend l'item FAIT, un compte nul rend l'item À FAIRE", () => {
    expect(itemFromProbe("first-lead", { ok: true, count: 3 })).toEqual({
      id: "first-lead",
      state: "done",
      count: 3,
    });
    expect(itemFromProbe("first-lead", { ok: true, count: 0 })).toEqual({
      id: "first-lead",
      state: "todo",
      count: 0,
    });
  });

  it("borne le compteur exposé (aucun volume métier ne fuit)", () => {
    expect(capCount(10_000)).toBe(COUNT_CAP);
    expect(capCount(-4)).toBe(0);
    expect(capCount(Number.NaN)).toBe(0);
    expect(itemFromProbe("first-property", { ok: true, count: 5000 }).count).toBe(COUNT_CAP);
  });

  it("couvre exactement les 7 items du lot, dont 6 dérivés d'une table", () => {
    expect(CHECKLIST_ITEM_IDS).toHaveLength(7);
    expect(DB_DERIVED_ITEM_IDS).toHaveLength(6);
    expect(Object.values(CHECKLIST_SOURCES).map((s) => s.table)).toEqual([
      "leads",
      "properties",
      "estimations",
      "prosp_criteres_acquereur",
      "prosp_matchs",
      "outbox_drafts",
    ]);
  });
});

describe("checklist — dégradation honnête quand la table est absente", () => {
  it("table absente → INDÉTERMINÉ, jamais « fait » ni « à faire »", () => {
    const item = itemFromProbe("first-draft", { ok: false, reason: "schema_missing" });
    expect(item.state).toBe("unknown");
    expect(item.state).not.toBe("done");
    expect(item.count).toBeNull();
    expect(item.reason).toBe("schema_missing");
  });

  it("sonde en erreur → INDÉTERMINÉ avec sa propre raison", () => {
    expect(itemFromProbe("first-match", { ok: false, reason: "probe_failed" })).toMatchObject({
      state: "unknown",
      reason: "probe_failed",
    });
  });

  it("un seul item indéterminé empêche la checklist d'être déclarée terminée", () => {
    const items: ChecklistItem[] = CHECKLIST_ITEM_IDS.map((id, i) =>
      i === 5
        ? { id, state: "unknown", count: null, reason: "schema_missing" }
        : { id, state: "done", count: 1 },
    );
    const s = summarize(items);
    expect(s.done).toBe(6);
    expect(s.unknown).toBe(1);
    expect(s.completed).toBe(false);
  });

  it("checklist terminée uniquement quand les 7 items sont faits", () => {
    const s = summarize(CHECKLIST_ITEM_IDS.map((id) => ({ id, state: "done", count: 1 })));
    expect(s.completed).toBe(true);
    expect(s.done).toBe(7);
  });

  it("un item manquant dans la réponse est comblé en indéterminé, pas en « à faire »", () => {
    const s = summarize([{ id: "first-lead", state: "done", count: 1 }]);
    expect(s.items).toHaveLength(7);
    expect(s.items.filter((i) => i.state === "unknown")).toHaveLength(6);
    expect(s.completed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Centre d'actions — dérivé de la progression du tour                  */
/* ------------------------------------------------------------------ */

const fakeTour = {
  key: ACTION_CENTER_TOUR_KEY,
  version: 1,
  title: "t",
  description: "d",
  entryRoute: "/",
  steps: [
    { id: "welcome", title: "a", body: "b" },
    { id: "nav", title: "a", body: "b" },
    { id: ACTION_CENTER_STEP_ID, title: "a", body: "b" },
    { id: "wrapup", title: "a", body: "b" },
  ],
} as unknown as TourDefinition;

describe("checklist — « consulter le Centre d'actions »", () => {
  it("localise l'étape dans le tour socle (pas d'index en dur)", () => {
    expect(actionCenterStepIndex(fakeTour)).toBe(2);
    expect(actionCenterStepIndex(null)).toBeNull();
  });

  it("fait dès que l'étape est atteinte ou le tour terminé", () => {
    const at = [{ tour_key: ACTION_CENTER_TOUR_KEY, status: "in_progress", current_step: 2 }];
    const before = [{ tour_key: ACTION_CENTER_TOUR_KEY, status: "in_progress", current_step: 1 }];
    const done = [{ tour_key: ACTION_CENTER_TOUR_KEY, status: "completed", current_step: 0 }];

    expect(hasSeenActionCenter(at, 2)).toBe(true);
    expect(hasSeenActionCenter(before, 2)).toBe(false);
    expect(hasSeenActionCenter(done, 2)).toBe(true);
  });

  it("ignore la progression d'un autre tour", () => {
    expect(hasSeenActionCenter([{ tour_key: "crm", status: "completed", current_step: 9 }], 2)).toBe(
      false,
    );
  });

  it("progression illisible (table 0059 absente) → indéterminé, jamais « fait »", () => {
    const item = actionCenterItem({ ok: false, reason: "schema_missing" }, 2);
    expect(item.state).toBe("unknown");
    expect(item.reason).toBe("schema_missing");
  });

  it("la progression locale peut CONFIRMER un fait, jamais rétrograder un fait serveur", () => {
    const unknown: ChecklistItem = { id: "action-center", state: "unknown", count: null };
    expect(mergeLocalActionCenter(unknown, true).state).toBe("done");
    expect(mergeLocalActionCenter(unknown, false).state).toBe("unknown");

    const doneItem: ChecklistItem = { id: "action-center", state: "done", count: 1 };
    expect(mergeLocalActionCenter(doneItem, false)).toEqual(doneItem);
  });
});

/* ------------------------------------------------------------------ */
/* Sondes DB — owner-scope, bornage, lecture seule                      */
/* ------------------------------------------------------------------ */

describe("buildChecklist — sondes owner-scopées, bornées et en lecture seule", () => {
  it("dérive chaque item de sa table réelle, filtrée tenant_id + user_id", async () => {
    const { db, calls } = makeDb({
      leads: { count: 2 },
      properties: { count: 1 },
      estimations: { count: 0 },
      prosp_criteres_acquereur: { count: 1 },
      prosp_matchs: { count: 0 },
      outbox_drafts: { count: 0 },
      user_product_tour_progress: { count: 0 },
    });

    const summary = await buildChecklist(db, TENANT, USER);
    const byId = new Map(summary.items.map((i) => [i.id, i]));

    expect(byId.get("first-lead")?.state).toBe("done");
    expect(byId.get("first-property")?.state).toBe("done");
    expect(byId.get("first-estimation")?.state).toBe("todo");
    expect(byId.get("buyer-criteria")?.state).toBe("done");
    expect(byId.get("first-match")?.state).toBe("todo");
    expect(byId.get("first-draft")?.state).toBe("todo");
    expect(summary.completed).toBe(false);

    const probes = calls.filter((c) => c.table !== "user_product_tour_progress");
    expect(probes).toHaveLength(6);
    for (const call of probes) {
      // Owner-check applicatif : le client admin bypasse la RLS.
      const filters = Object.fromEntries(call.filters);
      expect(filters.tenant_id).toBe(TENANT);
      expect(filters.user_id).toBe(USER);
      // Requête bornée, aucune ligne ramenée, jamais de `select *`.
      expect(call.columns).toBe("id");
      expect(call.columns).not.toContain("*");
      expect(call.head).toBe(true);
      expect(call.count).toBe("exact");
      expect(call.limit).toBe(1);
    }
  });

  it("le critère acquéreur ne compte que s'il est ACTIF", async () => {
    const { db, calls } = makeDb({});
    await buildChecklist(db, TENANT, USER);
    const critere = calls.find((c) => c.table === "prosp_criteres_acquereur");
    expect(Object.fromEntries(critere!.filters).actif).toBe(true);
  });

  it("tables absentes → items indéterminés, les autres restent lisibles", async () => {
    const { db } = makeDb({
      leads: { count: 1 },
      properties: { count: 0 },
      estimations: { count: 0 },
      prosp_criteres_acquereur: { errorCode: "PGRST205" },
      prosp_matchs: { errorCode: "42P01" },
      outbox_drafts: { errorCode: "PGRST205" },
      user_product_tour_progress: { errorCode: "42P01" },
    });

    const summary = await buildChecklist(db, TENANT, USER);
    const byId = new Map(summary.items.map((i) => [i.id, i]));

    expect(byId.get("first-lead")?.state).toBe("done");
    expect(byId.get("first-property")?.state).toBe("todo");
    for (const id of ["buyer-criteria", "first-match", "first-draft", "action-center"] as const) {
      expect(byId.get(id)?.state).toBe("unknown");
      expect(byId.get(id)?.reason).toBe("schema_missing");
    }
    expect(summary.unknown).toBe(4);
    expect(summary.completed).toBe(false);
  });

  it("une erreur DB ordinaire reste indéterminée (et ne fait pas « fait »)", async () => {
    const { db } = makeDb({ leads: { errorCode: "57014" } });
    const summary = await buildChecklist(db, TENANT, USER);
    const lead = summary.items.find((i) => i.id === "first-lead");
    expect(lead?.state).toBe("unknown");
    expect(lead?.reason).toBe("probe_failed");
  });

  it("aucune mutation n'est tentée (le faux client jette sur insert/update/delete)", async () => {
    const { db, calls } = makeDb({});
    await expect(buildChecklist(db, TENANT, USER)).resolves.toBeDefined();
    // Toutes les requêtes émises sont des lectures sans ligne ramenée.
    expect(calls.every((c) => c.columns.length > 0)).toBe(true);
    expect(calls.filter((c) => c.table !== "user_product_tour_progress").every((c) => c.head)).toBe(
      true,
    );
  });
});
