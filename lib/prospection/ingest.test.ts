import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock du client admin AVANT l'import du module testé (hoisting vi.mock).
const getSupabaseAdmin = vi.fn();
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import {
  upsertAnnonces,
  startIngestionRun,
  finishIngestionRun,
  bodyHash,
  lookupIdempotent,
  reserveIdempotent,
  completeIdempotent,
} from "./ingest";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";

// ── Fake Supabase in-memory (juste ce que le module utilise) ─────────────────

type Row = Record<string, unknown>;

class FakeDb {
  tables: Record<string, Row[]> = {
    prosp_annonces: [],
    prosp_annonce_versions: [],
    prosp_ingestion_runs: [],
    prosp_idempotency_keys: [],
  };
  // Unicité (tenant_id, idem_key) pour prosp_idempotency_keys.

  from(table: string) {
    const rows = this.tables[table] ?? (this.tables[table] = []);
    return new FakeQuery(table, rows);
  }
}

let idSeq = 0;
function newId(): string {
  idSeq += 1;
  return `id-${idSeq}`;
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private inFilter: [string, unknown[]] | null = null;
  private op: "select" | "insert" | "upsert" | "update" | null = null;
  private payload: Row | Row[] | null = null;
  private conflict: string[] | null = null;

  constructor(private table: string, private rows: Row[]) {}

  select(_cols: string) {
    if (this.op === null) this.op = "select";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.inFilter = [col, vals];
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = payload;
    this.conflict = opts?.onConflict ? opts.onConflict.split(",") : null;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  private match(r: Row): boolean {
    for (const [c, v] of this.filters) if (r[c] !== v) return false;
    if (this.inFilter) {
      const [c, vals] = this.inFilter;
      if (!vals.includes(r[c])) return false;
    }
    return true;
  }

  private runWrite(): { data: Row[]; error: unknown } {
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const out: Row[] = [];
      for (const p of list) {
        // Unicité idempotency_keys.
        if (this.table === "prosp_idempotency_keys") {
          const dup = this.rows.find(
            (r) => r.tenant_id === p.tenant_id && r.idem_key === p.idem_key,
          );
          if (dup) return { data: [], error: { code: "23505" } };
        }
        const row = { id: newId(), ...p };
        this.rows.push(row);
        out.push(row);
      }
      return { data: out, error: null };
    }
    if (this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const out: Row[] = [];
      for (const p of list) {
        const keys = this.conflict ?? [];
        const existing = this.rows.find((r) => keys.every((k) => r[k] === p[k]));
        if (existing) Object.assign(existing, p);
        else this.rows.push({ id: newId(), ...p });
        out.push(existing ?? this.rows[this.rows.length - 1]);
      }
      return { data: out, error: null };
    }
    if (this.op === "update") {
      const out: Row[] = [];
      for (const r of this.rows) {
        if (this.match(r)) {
          Object.assign(r, this.payload);
          out.push(r);
        }
      }
      return { data: out, error: null };
    }
    // select
    return { data: this.rows.filter((r) => this.match(r)), error: null };
  }

  async single() {
    const { data, error } = this.runWrite();
    if (error) return { data: null, error };
    return { data: data[0] ?? null, error: null };
  }
  async maybeSingle() {
    const { data, error } = this.runWrite();
    return { data: data[0] ?? null, error };
  }
  // Terminal thenable pour `await query` (le PostgrestBuilder réel de
  // supabase-js est lui-même thenable : le mock reproduit ce contrat).
  // biome-ignore lint/suspicious/noThenProperty: mock supabase — thenable volontaire, jamais du code produit.
  then(resolve: (v: { data: Row[]; error: unknown }) => unknown) {
    return Promise.resolve(this.runWrite()).then(resolve);
  }
}

const TENANT = "tenant-x";
const mk = (over: Partial<MoteurImmoListing>): MoteurImmoListing => ({
  id: "a1",
  typeBien: "appartement",
  titre: "Appart",
  prix: 300000,
  surface: 60,
  pieces: 3,
  codePostal: "06600",
  ville: "Antibes",
  ...over,
});

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  idSeq = 0;
  getSupabaseAdmin.mockReturnValue(db);
});

describe("upsertAnnonces — idempotence de l'upsert", () => {
  it("réingérer les mêmes annonces ne crée pas de doublon", async () => {
    const listings = [mk({ id: "a1" }), mk({ id: "a2", pieces: 4, prix: 450000 })];
    const s1 = await upsertAnnonces(TENANT, listings, "apify_lbc");
    expect(s1.inserted).toBe(2);
    expect(db.tables.prosp_annonces).toHaveLength(2);

    const s2 = await upsertAnnonces(TENANT, listings, "apify_lbc");
    expect(db.tables.prosp_annonces).toHaveLength(2); // pas de doublon
    expect(s2.inserted).toBe(0);
    expect(s2.updated).toBe(2); // reconnues comme existantes
  });

  it("déduplique intra-batch (même hash) et compte les duplicates", async () => {
    const listings = [mk({ id: "a1" }), mk({ id: "a1-bis" })]; // même hash (mêmes attrs)
    const s = await upsertAnnonces(TENANT, listings, "apify_lbc");
    expect(s.duplicates).toBe(1);
    expect(db.tables.prosp_annonces).toHaveLength(1);
  });

  it("mode dégradé : liste vide → aucun write, stats à zéro", async () => {
    const s = await upsertAnnonces(TENANT, [], "apify_lbc");
    expect(s).toEqual({ inserted: 0, updated: 0, duplicates: 0, errors: 0 });
    expect(db.tables.prosp_annonces).toHaveLength(0);
  });
});

describe("upsertAnnonces — versioning de prix", () => {
  it("baisse de prix détectée → ligne version + prix_precedent + republication", async () => {
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 300000 })], "apify_lbc");
    expect(db.tables.prosp_annonce_versions).toHaveLength(0);

    // Réingestion avec prix plus bas (hors même bucket : Δ>5000).
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 280000 })], "apify_lbc");

    const versions = db.tables.prosp_annonce_versions;
    expect(versions).toHaveLength(1);
    expect(versions[0].prix).toBe(300000); // ancien prix archivé
    expect(versions[0].statut).toBe("baisse");

    // La ligne active (nouveau hash) porte le nouveau prix + prix_precedent.
    const active = db.tables.prosp_annonces.find((r) => r.actif !== false && r.prix === 280000);
    expect(active).toBeTruthy();
    expect(active!.prix_precedent).toBe(300000);
    expect(active!.republication).toBe(true);
    // L'ancienne ligne (hash 300k) a été désactivée → pas de doublon actif.
    const stale = db.tables.prosp_annonces.find((r) => r.prix === 300000);
    expect(stale?.actif).toBe(false);
  });

  it("prix inchangé → aucune version", async () => {
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 300000 })], "apify_lbc");
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 300000 })], "apify_lbc");
    expect(db.tables.prosp_annonce_versions).toHaveLength(0);
  });

  it("hausse de prix → version statut hausse, pas de republication", async () => {
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 300000 })], "apify_lbc");
    await upsertAnnonces(TENANT, [mk({ id: "a1", prix: 330000 })], "apify_lbc");
    const versions = db.tables.prosp_annonce_versions;
    expect(versions).toHaveLength(1);
    expect(versions[0].statut).toBe("hausse");
    const active = db.tables.prosp_annonces.find((r) => r.prix === 330000);
    expect(active!.republication).toBe(false);
  });
});

describe("runs d'ingestion", () => {
  it("startIngestionRun crée une ligne running, finishIngestionRun la clôture", async () => {
    const run = await startIngestionRun(TENANT, "apify_lbc", ["06600", "06400"]);
    expect(run).not.toBeNull();
    const created = db.tables.prosp_ingestion_runs[0];
    expect(created.status).toBe("running");
    expect(created.provider).toBe("apify_lbc");
    expect(created.zones).toEqual(["06600", "06400"]);

    await finishIngestionRun(run!, "completed", {
      inserted: 5,
      updated: 2,
      duplicates: 1,
      errors: 0,
    });
    const done = db.tables.prosp_ingestion_runs[0];
    expect(done.status).toBe("completed");
    expect(done.inserted).toBe(5);
    expect(done.updated).toBe(2);
    expect(done.ended_at).toBeTruthy();
  });
});

describe("idempotence des runs", () => {
  it("reserveIdempotent réussit une fois, échoue au rejeu de la même clé", async () => {
    const h = bodyHash({ zones: ["06600"] });
    expect(await reserveIdempotent(TENANT, "key-1", h)).toBe(true);
    expect(await reserveIdempotent(TENANT, "key-1", h)).toBe(false); // déjà réservée
    // Une autre clé passe.
    expect(await reserveIdempotent(TENANT, "key-2", h)).toBe(true);
  });

  it("lookupIdempotent renvoie null tant que non complété, la réponse ensuite", async () => {
    await reserveIdempotent(TENANT, "key-1", "h");
    expect(await lookupIdempotent(TENANT, "key-1")).toBeNull(); // status=running
    await completeIdempotent(TENANT, "key-1", { ok: true, inserted: 3 });
    expect(await lookupIdempotent(TENANT, "key-1")).toEqual({ ok: true, inserted: 3 });
  });

  it("l'isolation tenant : même clé sur un autre tenant est indépendante", async () => {
    expect(await reserveIdempotent("t-A", "shared", "h")).toBe(true);
    expect(await reserveIdempotent("t-B", "shared", "h")).toBe(true);
  });
});
