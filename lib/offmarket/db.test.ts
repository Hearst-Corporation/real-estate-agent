import { describe, it, expect } from "vitest";
import type { Gpu1Client } from "@/lib/gpu1";
import { createSelection, upsertFeedback, loadPublicSelection } from "./db";

/**
 * Fake gpu1 client : chaque `from(table)` renvoie un builder chaînable thenable.
 * On configure par table une réponse `{ data, error }` (liste) et, pour les
 * lectures single, une réponse `single`. Les inserts/upserts enregistrent leurs
 * payloads pour assertion.
 */
type Resp = { data?: unknown; error?: { message: string; code?: string } | null; single?: { data?: unknown; error?: unknown } };

function makeClient(config: Record<string, Resp>, sink: { inserts: unknown[]; upserts: unknown[] }): Gpu1Client {
  function builder(table: string) {
    const cfg = config[table] ?? { data: [], error: null };
    const listResult = { data: cfg.data ?? [], error: cfg.error ?? null, count: null };
    const singleResult = cfg.single ?? { data: (Array.isArray(cfg.data) ? cfg.data[0] : cfg.data) ?? null, error: cfg.error ?? null };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.eq = chain; b.in = chain; b.order = chain; b.limit = chain;
    b.insert = (v: unknown) => { sink.inserts.push({ table, values: v }); return { ...listResult, then: (r: (x: unknown) => unknown) => Promise.resolve(r(listResult)) }; };
    b.upsert = (v: unknown) => { sink.upserts.push({ table, values: v }); return { then: (r: (x: unknown) => unknown) => Promise.resolve(r(listResult)) }; };
    b.maybeSingle = () => ({ then: (r: (x: unknown) => unknown) => Promise.resolve(r(singleResult)) });
    b.then = (r: (x: unknown) => unknown) => Promise.resolve(r(listResult));
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as Gpu1Client;
}

describe("createSelection", () => {
  it("insère la sélection + ses items et renvoie l'id", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      { offmarket_selections: { error: null }, offmarket_selection_items: { error: null } },
      sink,
    );
    const out = await createSelection(sb, {
      userId: "u1", tenantId: "t1", titre: "Sel", leadId: null, critereId: null, shareToken: "tok",
      items: [{ propertyId: "p1", scoreMatch: 88, scoreBreakdown: { zone: 40 } }],
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.selectionId).toMatch(/[0-9a-f-]{36}/);
    expect(sink.inserts).toHaveLength(2); // selection + items
  });

  it("dégrade en unavailable si la table est absente (42P01)", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient({ offmarket_selections: { error: { message: "x", code: "42P01" } } }, sink);
    const out = await createSelection(sb, {
      userId: "u1", tenantId: "t1", titre: "Sel", leadId: null, critereId: null, shareToken: "tok", items: [],
    });
    expect(out).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("upsertFeedback", () => {
  it("persiste le verdict quand item ∈ sélection active", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      {
        offmarket_selections: { single: { data: { id: "s1", tenant_id: "t1", statut: "active" }, error: null } },
        offmarket_selection_items: { single: { data: { id: "i1", selection_id: "s1" }, error: null } },
        offmarket_feedback: { error: null },
      },
      sink,
    );
    const out = await upsertFeedback(sb, { selectionId: "s1", itemId: "i1", verdict: "interesse", commentaire: null });
    expect(out.ok).toBe(true);
    expect(sink.upserts).toHaveLength(1);
    const up = sink.upserts[0] as { values: { verdict: string; item_id: string } };
    expect(up.values.verdict).toBe("interesse");
    expect(up.values.item_id).toBe("i1");
  });

  it("refuse (not_found) un item n'appartenant pas à la sélection — anti-énumération", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      {
        offmarket_selections: { single: { data: { id: "s1", tenant_id: "t1", statut: "active" }, error: null } },
        offmarket_selection_items: { single: { data: null, error: null } }, // item absent de cette sélection
      },
      sink,
    );
    const out = await upsertFeedback(sb, { selectionId: "s1", itemId: "other", verdict: "interesse", commentaire: null });
    expect(out).toEqual({ ok: false, reason: "not_found" });
    expect(sink.upserts).toHaveLength(0);
  });

  it("refuse une sélection révoquée", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      { offmarket_selections: { single: { data: { id: "s1", tenant_id: "t1", statut: "revoked" }, error: null } } },
      sink,
    );
    const out = await upsertFeedback(sb, { selectionId: "s1", itemId: "i1", verdict: "a_revoir", commentaire: null });
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("loadPublicSelection", () => {
  it("mappe items + feedback courant", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      {
        offmarket_selections: { single: { data: { id: "s1", titre: "Ma sel", statut: "active" }, error: null } },
        offmarket_selection_items: {
          data: [
            {
              id: "i1", property_id: "p1", score_match: 77,
              properties: { title: "T3", property_type: "appartement", city: "Nice", postal_code: "06000", surface: 65, rooms: 3, asking_price: 320000, dpe_letter: "C", has_terrace: true, has_parking: false, has_garden: false, has_pool: false, has_elevator: true },
              offmarket_feedback: { verdict: "interesse", commentaire: null },
            },
          ],
        },
      },
      sink,
    );
    const out = await loadPublicSelection(sb, "s1");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.titre).toBe("Ma sel");
      expect(out.data.items).toHaveLength(1);
      expect(out.data.items[0].scoreMatch).toBe(77);
      expect(out.data.items[0].verdict).toBe("interesse");
      expect(out.data.items[0].title).toBe("T3");
    }
  });

  it("not_found si sélection révoquée", async () => {
    const sink = { inserts: [] as unknown[], upserts: [] as unknown[] };
    const sb = makeClient(
      { offmarket_selections: { single: { data: { id: "s1", titre: "x", statut: "revoked" }, error: null } } },
      sink,
    );
    const out = await loadPublicSelection(sb, "s1");
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });
});
