/**
 * lib/agent-gateway/test-helpers.ts — faux client GPU1 in-memory pour les
 * tests unitaires de la gateway. Déterministe, aucun réseau, aucune vraie DB.
 *
 * Ce module N'EST PAS du code produit (importé uniquement par *.test.ts). Il
 * reproduit le contrat thenable + le sous-ensemble de méthodes que la gateway
 * utilise réellement : select/insert/update/upsert, eq/is/gt/in/or, maybeSingle,
 * single, limit, et l'await direct (thenable).
 */

export type Row = Record<string, unknown>;

interface UniqueSpec {
  cols: string[];
  where?: (r: Row) => boolean; // index partiel (ex. status='approved')
}

let idSeq = 0;
export function resetIdSeq(): void {
  idSeq = 0;
}
function newId(): string {
  idSeq += 1;
  return `00000000-0000-4000-8000-${String(idSeq).padStart(12, "0")}`;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  // Contraintes d'unicité par table (violation → { error: { code: 23505 } }).
  private uniques: Record<string, UniqueSpec> = {
    agent_gateway_idempotency_keys: { cols: ["tenant_id", "interface", "idem_key"] },
    agent_alert_approvals: {
      cols: ["tenant_id", "match_id", "channel", "content_hash"],
      where: (r) => r.status === "approved",
    },
  };

  constructor(seed?: Record<string, Row[]>) {
    // On garde les MÊMES références de lignes que le seed : un test peut ainsi
    // observer les mutations (status→consumed, alerte_at, …) sur son propre tableau.
    if (seed) for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows;
  }

  private ensure(table: string): Row[] {
    return this.tables[table] ?? (this.tables[table] = []);
  }

  from(table: string): FakeQuery {
    return new FakeQuery(table, this.ensure(table), this.uniques[table]);
  }
}

export class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private notNullIs: string[] = [];
  private isNull: string[] = [];
  private gtFilters: Array<[string, unknown]> = [];
  private inFilter: [string, unknown[]] | null = null;
  private orRaw: string | null = null;
  private op: "select" | "insert" | "upsert" | "update" | "delete" | null = null;
  private payload: Row | Row[] | null = null;
  private conflict: string[] | null = null;
  private limitN: number | null = null;
  private rangeFromTo: [number, number] | null = null;
  private wantCount = false;

  constructor(
    _table: string, // conservé pour la signature from(table) ; non lu (query opère sur rows)
    private rows: Row[],
    private unique: UniqueSpec | undefined,
  ) {}

  select(_cols?: string, opts?: { count?: string }) {
    if (this.op === null) this.op = "select";
    if (opts?.count) this.wantCount = true;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFromTo = [from, to];
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  is(col: string, val: null) {
    if (val === null) this.isNull.push(col);
    return this;
  }
  gt(col: string, val: unknown) {
    this.gtFilters.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.inFilter = [col, vals];
    return this;
  }
  or(raw: string) {
    this.orRaw = raw;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  order() {
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
  delete() {
    this.op = "delete";
    return this;
  }

  private matchOr(r: Row): boolean {
    if (!this.orRaw) return true;
    // Format PostgREST : "col.eq.val,col2.eq.val2" → OR entre clauses.
    const clauses = this.orRaw.split(",");
    for (const c of clauses) {
      const m = /^([a-z_]+)\.eq\.(.+)$/.exec(c.trim());
      if (m && String(r[m[1]]) === m[2]) return true;
    }
    return false;
  }

  private match(r: Row): boolean {
    for (const [c, v] of this.filters) if (r[c] !== v) return false;
    for (const c of this.isNull) if (r[c] != null) return false;
    for (const c of this.notNullIs) if (r[c] == null) return false;
    for (const [c, v] of this.gtFilters) {
      const rv = r[c];
      if (rv == null) return false;
      if (!(String(rv) > String(v))) return false;
    }
    if (this.inFilter) {
      const [c, vals] = this.inFilter;
      if (!vals.includes(r[c])) return false;
    }
    if (!this.matchOr(r)) return false;
    return true;
  }

  private violatesUnique(p: Row): boolean {
    if (!this.unique) return false;
    const { cols, where } = this.unique;
    return this.rows.some((r) => {
      if (where && (!where(r) || !where(p))) return false;
      return cols.every((k) => r[k] === p[k]);
    });
  }

  private runWrite(): { data: Row[]; error: unknown; count?: number | null } {
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const out: Row[] = [];
      for (const p of list) {
        if (this.violatesUnique(p)) return { data: [], error: { code: "23505" } };
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
    if (this.op === "delete") {
      // Supprime en place les lignes filtrées du tableau partagé (mute la même
      // référence que le seed), renvoie les lignes supprimées (comme PostgREST).
      const removed: Row[] = [];
      for (let i = this.rows.length - 1; i >= 0; i--) {
        if (this.match(this.rows[i])) removed.push(...this.rows.splice(i, 1));
      }
      return { data: removed, error: null };
    }
    // select
    const matched = this.rows.filter((r) => this.match(r));
    const total = matched.length;
    let data = matched;
    if (this.rangeFromTo) data = data.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1);
    if (this.limitN != null) data = data.slice(0, this.limitN);
    return { data, error: null, count: this.wantCount ? total : null };
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
  // Terminal thenable pour `await query` (le PostgrestBuilder réel est thenable).
  // biome-ignore lint/suspicious/noThenProperty: mock du client GPU1 — thenable volontaire.
  then(resolve: (v: { data: Row[]; error: unknown; count?: number | null }) => unknown) {
    return Promise.resolve(this.runWrite()).then(resolve);
  }
}
