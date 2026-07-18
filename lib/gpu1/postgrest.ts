// lib/gpu1/postgrest.ts — Client PostgREST natif (fetch), serveur-only.
//
// Remplace le SDK @supabase/supabase-js par un client minimal câblé sur le
// PostgREST self-hosté gpu1. Expose une API de query CHAÎNABLE volontairement
// proche de celle de supabase-js (from/select/insert/update/delete/upsert/rpc,
// filtres eq/neq/gt/gte/lt/lte/in/is/like/or/not/contains, order/limit/range,
// single/maybeSingle) afin de minimiser le diff des routes consommatrices.
//
// Contrat de résultat, identique partout : `{ data, error, count }`.
//  - `data`  : lignes (T[]) ou ligne unique (T) selon single/maybeSingle/head.
//  - `error` : `null` en succès, sinon `{ message, code?, details?, hint? }`.
//  - `count` : nombre total si demandé via l'option `{ count: 'exact' }`.
//
// Sécurité : le token admin (service-role, bypass RLS) part en Authorization
// Bearer et n'est JAMAIS journalisé ni renvoyé dans une erreur. Aucune URL
// secrète ni PII n'est loggée. Timeout déterministe via AbortController.
//
// Ce module N'IMPORTE PAS `server-only` au top-level pour rester testable en
// Node pur ; l'usine `getGpu1Admin()` (index.ts) porte le garde serveur-only.

// ── Types de résultat (forme stable, blast-radius minimal) ───────────────────

/** Erreur normalisée — jamais de secret/URL/token dedans. */
export type PostgrestError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/** Résultat d'une requête liste. */
export type PostgrestListResult<T> = {
  data: T[] | null;
  error: PostgrestError | null;
  count: number | null;
};

/** Résultat d'une requête à cardinalité unique (single/maybeSingle/head). */
export type PostgrestSingleResult<T> = {
  data: T | null;
  error: PostgrestError | null;
  count: number | null;
};

/** Résultat d'un appel RPC. `data` = ce que renvoie la fonction (scalaire/objet/tableau). */
export type PostgrestRpcResult<T> = {
  data: T | null;
  error: PostgrestError | null;
  count: number | null;
};

/** Comptage PostgREST. */
export type CountMode = "exact" | "planned" | "estimated";

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

/** Transport injectable (fetch réel en prod, fake en test). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type Gpu1ClientConfig = {
  /** Base PostgREST, ex. https://real-estate-agent-db.hearst.app/rest/v1 */
  baseUrl: string;
  /** JWT service-role (bypass RLS). Jamais loggé. */
  token: string;
  /** Timeout par requête (ms). Défaut 15000. */
  timeoutMs?: number;
  /** Transport (fetch global par défaut). Injectable pour les tests. */
  fetchImpl?: FetchLike;
};

// ── Utilitaires d'encodage ───────────────────────────────────────────────────

/** Valeur → littéral PostgREST sûr pour un filtre `col=op.valeur`. */
function encodeFilterValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    // Liste PostgREST : (a,b,c) — chaque élément quoté si besoin.
    return `(${value.map((v) => encodeListItem(v)).join(",")})`;
  }
  return String(value);
}

/** Élément d'une liste `in.(…)` : quote si la valeur contient un séparateur. */
function encodeListItem(v: unknown): string {
  if (v === null) return "null";
  const s = String(v);
  if (/[,()"\s]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Nettoie un nom de colonne pour l'ordre/select (anti-injection basique). */
function safeColumn(col: string): string {
  // PostgREST accepte lettres, chiffres, _, . (relations), * . On refuse le reste.
  if (!/^[a-zA-Z0-9_.*]+$/.test(col)) {
    throw new Error(`Nom de colonne invalide: ${col}`);
  }
  return col;
}

// ── Filtres accumulés ────────────────────────────────────────────────────────

type FilterEntry =
  | { kind: "op"; column: string; op: string; value: unknown }
  | { kind: "raw"; expr: string }; // ex. or(...) → construit tel quel

type OrderEntry = { column: string; ascending: boolean; nullsFirst?: boolean };

// ── Query builder ────────────────────────────────────────────────────────────

/**
 * Builder chaînable et « thenable » : `await builder` déclenche la requête.
 * Cardinalité liste par défaut ; `.single()`/`.maybeSingle()` la restreint.
 */
export class Gpu1QueryBuilder<T = Record<string, unknown>>
  implements PromiseLike<PostgrestListResult<T>>
{
  private method: Method = "GET";
  private filters: FilterEntry[] = [];
  private orders: OrderEntry[] = [];
  private selectColumns = "*";
  private wantSelect = false; // insert/update/upsert avec retour de lignes
  private body: unknown = undefined;
  private countMode: CountMode | null = null;
  private headOnly = false;
  private cardinality: "many" | "one" | "maybeOne" = "many";
  private limitValue: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private onConflictCols: string | null = null;
  private ignoreDuplicates = false;

  constructor(
    private readonly cfg: Required<Omit<Gpu1ClientConfig, "fetchImpl">> & {
      fetchImpl: FetchLike;
    },
    private readonly table: string,
  ) {}

  // ── Verbes ──
  select(columns = "*", opts?: { count?: CountMode; head?: boolean }): this {
    this.selectColumns = columns;
    this.wantSelect = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    // select() sur GET reste GET ; sur mutation il déclenche `Prefer: return=representation`.
    return this;
  }

  insert(values: unknown): this {
    this.method = "POST";
    this.body = values;
    return this;
  }

  update(values: unknown): this {
    this.method = "PATCH";
    this.body = values;
    return this;
  }

  upsert(values: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.method = "POST";
    this.body = values;
    if (opts?.onConflict) this.onConflictCols = opts.onConflict;
    if (opts?.ignoreDuplicates) this.ignoreDuplicates = true;
    return this;
  }

  delete(): this {
    this.method = "DELETE";
    return this;
  }

  // ── Filtres ──
  private addOp(column: string, op: string, value: unknown): this {
    this.filters.push({ kind: "op", column: safeColumn(column), op, value });
    return this;
  }
  eq(column: string, value: unknown): this {
    return this.addOp(column, "eq", value);
  }
  neq(column: string, value: unknown): this {
    return this.addOp(column, "neq", value);
  }
  gt(column: string, value: unknown): this {
    return this.addOp(column, "gt", value);
  }
  gte(column: string, value: unknown): this {
    return this.addOp(column, "gte", value);
  }
  lt(column: string, value: unknown): this {
    return this.addOp(column, "lt", value);
  }
  lte(column: string, value: unknown): this {
    return this.addOp(column, "lte", value);
  }
  like(column: string, pattern: string): this {
    return this.addOp(column, "like", pattern);
  }
  ilike(column: string, pattern: string): this {
    return this.addOp(column, "ilike", pattern);
  }
  is(column: string, value: null | boolean): this {
    return this.addOp(column, "is", value === null ? "null" : String(value));
  }
  in(column: string, values: readonly unknown[]): this {
    return this.addOp(column, "in", values as unknown[]);
  }
  contains(column: string, value: unknown): this {
    // PostgREST `cs.{…}` (array/jsonb). On sérialise en JSON si objet/array.
    const v = typeof value === "string" ? value : JSON.stringify(value);
    return this.addOp(column, "cs", v);
  }
  /**
   * `not(column, op, value)` → `column=not.op.value`.
   * Ex. `.not("enriched_at", "is", null)` ou `.not("status","in","(a,b)")`.
   */
  not(column: string, op: string, value: unknown): this {
    const encoded =
      value === null
        ? "null"
        : Array.isArray(value)
          ? encodeFilterValue(value)
          : String(value);
    this.filters.push({
      kind: "op",
      column: safeColumn(column),
      op: `not.${op}`,
      value: encoded,
      // marqué déjà encodé
    } as FilterEntry);
    (this.filters[this.filters.length - 1] as { preEncoded?: boolean }).preEncoded = true;
    return this;
  }
  /** `or("a.eq.1,b.eq.2")` → `or=(a.eq.1,b.eq.2)`. Chaîne PostgREST brute. */
  or(expr: string): this {
    this.filters.push({ kind: "raw", expr: `or=(${expr})` });
    return this;
  }

  // ── Tri / pagination ──
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({
      column: safeColumn(column),
      ascending: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }
  limit(n: number): this {
    this.limitValue = n;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  // ── Cardinalité ──
  single(): Gpu1SingleBuilder<T> {
    this.cardinality = "one";
    return new Gpu1SingleBuilder<T>(this);
  }
  maybeSingle(): Gpu1SingleBuilder<T> {
    this.cardinality = "maybeOne";
    return new Gpu1SingleBuilder<T>(this);
  }

  // ── Construction URL ──
  private buildQueryString(): string {
    const params: string[] = [];
    if (this.wantSelect && !this.headOnly) {
      params.push(`select=${encodeURIComponent(this.selectColumns)}`);
    } else if (this.method === "GET") {
      params.push(`select=${encodeURIComponent(this.selectColumns)}`);
    }
    for (const f of this.filters) {
      if (f.kind === "raw") {
        params.push(f.expr);
        continue;
      }
      const preEncoded = (f as { preEncoded?: boolean }).preEncoded === true;
      const val = preEncoded ? String(f.value) : encodeFilterValue(f.value);
      // La valeur peut contenir des caractères réservés → encode côté valeur.
      params.push(`${f.column}=${f.op}.${encodeURIComponent(val)}`);
    }
    if (this.orders.length > 0) {
      const ord = this.orders
        .map((o) => {
          let s = `${o.column}.${o.ascending ? "asc" : "desc"}`;
          if (o.nullsFirst === true) s += ".nullsfirst";
          else if (o.nullsFirst === false) s += ".nullslast";
          return s;
        })
        .join(",");
      params.push(`order=${encodeURIComponent(ord)}`);
    }
    if (this.limitValue != null) params.push(`limit=${this.limitValue}`);
    return params.join("&");
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const prefer: string[] = [];
    if (this.countMode) prefer.push(`count=${this.countMode}`);
    if (this.method === "POST" || this.method === "PATCH") {
      if (this.wantSelect) prefer.push("return=representation");
      else prefer.push("return=minimal");
    }
    if (this.method === "DELETE" && this.wantSelect) {
      prefer.push("return=representation");
    }
    if (this.onConflictCols) {
      prefer.push(this.ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates");
    }
    // Cardinalité unique → PostgREST renvoie un objet et 406 si ≠ 1 ligne.
    if (this.cardinality === "one" || this.cardinality === "maybeOne") {
      headers.Accept = "application/vnd.pgrst.object+json";
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      headers.Range = `${this.rangeFrom}-${this.rangeTo}`;
      headers["Range-Unit"] = "items";
    }
    if (prefer.length > 0) headers.Prefer = prefer.join(",");
    if (this.headOnly) headers.Accept = "application/json";
    return headers;
  }

  private buildUrl(): string {
    let path = `${this.cfg.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(this.table)}`;
    if (this.onConflictCols) {
      const oc = this.onConflictCols
        .split(",")
        .map((c) => safeColumn(c.trim()))
        .join(",");
      path += `?on_conflict=${encodeURIComponent(oc)}`;
    }
    const qs = this.buildQueryString();
    if (qs) path += (path.includes("?") ? "&" : "?") + qs;
    return path;
  }

  private httpMethod(): string {
    if (this.method === "GET" && this.headOnly) return "HEAD";
    return this.method;
  }

  /** Exécute et normalise en `{ data, error, count }`. */
  async run(): Promise<PostgrestListResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.cfg.fetchImpl(this.buildUrl(), {
        method: this.httpMethod(),
        headers: this.buildHeaders(),
        body:
          this.method === "GET" || this.method === "DELETE" || this.body === undefined
            ? undefined
            : JSON.stringify(this.body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted =
        (e as { name?: string })?.name === "AbortError" ||
        (e as Error)?.message?.includes("abort");
      // Jamais l'URL/le token dans le message.
      return {
        data: null,
        error: {
          message: aborted ? "request_timeout" : "network_error",
          code: aborted ? "ETIMEDOUT" : "ENETWORK",
        },
        count: null,
      };
    }
    clearTimeout(timer);

    const raw = await res.text();

    if (!res.ok) {
      let parsed: Partial<PostgrestError> = {};
      try {
        parsed = raw ? (JSON.parse(raw) as Partial<PostgrestError>) : {};
      } catch {
        parsed = {};
      }
      return {
        data: null,
        error: {
          message: parsed.message || `http_${res.status}`,
          code: parsed.code || String(res.status),
          details: parsed.details ?? null,
          hint: parsed.hint ?? null,
        },
        count: this.parseCount(res),
      };
    }

    if (this.headOnly) {
      return { data: null, error: null, count: this.parseCount(res) };
    }

    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        return {
          data: null,
          error: { message: "invalid_json_response", code: "EPARSE" },
          count: this.parseCount(res),
        };
      }
    }

    return {
      data: (data ?? (this.cardinality === "many" ? [] : null)) as T[] | null,
      error: null,
      count: this.parseCount(res),
    };
  }

  private parseCount(res: { headers: { get(name: string): string | null } }): number | null {
    if (!this.countMode) return null;
    // PostgREST : Content-Range: 0-9/42  ou  */42
    const cr = res.headers.get("content-range");
    if (!cr) return null;
    const total = cr.split("/")[1];
    if (!total || total === "*") return null;
    const n = Number.parseInt(total, 10);
    return Number.isNaN(n) ? null : n;
  }

  // ── Thenable : `await builder` → résultat liste ──
  then<R1 = PostgrestListResult<T>, R2 = never>(
    onfulfilled?: ((value: PostgrestListResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/**
 * Wrapper de cardinalité unique. `await` → `{ data: T|null, error, count }`.
 * - single()      : erreur si 0 ligne (PostgREST 406) → remontée telle quelle.
 * - maybeSingle() : 0 ligne → `data: null, error: null`.
 */
export class Gpu1SingleBuilder<T> implements PromiseLike<PostgrestSingleResult<T>> {
  constructor(private readonly inner: Gpu1QueryBuilder<T>) {}

  private async run(): Promise<PostgrestSingleResult<T>> {
    const r = await (this.inner as unknown as { run(): Promise<PostgrestListResult<T>> }).run();
    const isMaybe =
      (this.inner as unknown as { cardinality: string }).cardinality === "maybeOne";
    if (r.error) {
      // maybeSingle : 0 ligne renvoie un 406 PostgREST → on le neutralise en null.
      if (isMaybe && (r.error.code === "PGRST116" || r.error.code === "406")) {
        return { data: null, error: null, count: r.count };
      }
      return { data: null, error: r.error, count: r.count };
    }
    // PostgREST a renvoyé un objet (Accept object+json) ou null.
    const d = r.data as unknown;
    const single = Array.isArray(d) ? ((d[0] as T) ?? null) : ((d as T) ?? null);
    return { data: single, error: null, count: r.count };
  }

  then<R1 = PostgrestSingleResult<T>, R2 = never>(
    onfulfilled?: ((value: PostgrestSingleResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

// ── Résolution de type table → Row depuis le schéma `Database` ───────────────
// Reproduit la commodité de supabase-js : `client.from("leads")` infère la Row
// de `leads` sans annotation. Si `Db` n'expose pas de schéma `public` (ex.
// `unknown`), on retombe sur un objet générique — jamais d'erreur de type.

type PublicTablesViews<Db> = Db extends { public: { Tables: infer T; Views: infer V } }
  ? (T & V)
  : Record<string, { Row: Record<string, unknown> }>;

/** Noms de tables/vues connus du schéma. Fallback `string` si `Db` non typé. */
export type TableName<Db> = keyof PublicTablesViews<Db> & string;

/** Row d'une table/vue nommée. Fallback objet générique. */
export type RowOf<Db, N extends string> = N extends keyof PublicTablesViews<Db>
  ? PublicTablesViews<Db>[N] extends { Row: infer R }
    ? R
    : Record<string, unknown>
  : Record<string, unknown>;

// ── Client racine ────────────────────────────────────────────────────────────

export class Gpu1PostgrestClient<Db = unknown> {
  /** Phantom : porte le paramètre de type `Db` (schéma) sans coût runtime. */
  declare readonly __db?: Db;

  private readonly cfg: Required<Omit<Gpu1ClientConfig, "fetchImpl">> & {
    fetchImpl: FetchLike;
  };

  constructor(config: Gpu1ClientConfig) {
    const fetchImpl = config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!fetchImpl) {
      throw new Error("Aucune implémentation fetch disponible (globalThis.fetch absent).");
    }
    this.cfg = {
      baseUrl: config.baseUrl,
      token: config.token,
      timeoutMs: config.timeoutMs ?? 15000,
      fetchImpl,
    };
  }

  /**
   * Sélectionne une table/vue. La Row est inférée du schéma `Db` si le nom est
   * connu ; un paramètre de type explicite reste possible pour les projections.
   */
  from<N extends TableName<Db>>(table: N): Gpu1QueryBuilder<RowOf<Db, N>>;
  from<T>(table: string): Gpu1QueryBuilder<T>;
  from<T>(table: string): Gpu1QueryBuilder<T> {
    return new Gpu1QueryBuilder<T>(this.cfg, table);
  }

  /** Appelle une fonction RPC PostgREST (POST /rpc/<name>). */
  async rpc<T = unknown>(
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<PostgrestRpcResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.cfg.fetchImpl(
        `${this.cfg.baseUrl.replace(/\/$/, "")}/rpc/${encodeURIComponent(fn)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.cfg.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        },
      );
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as { name?: string })?.name === "AbortError";
      return {
        data: null,
        error: {
          message: aborted ? "request_timeout" : "network_error",
          code: aborted ? "ETIMEDOUT" : "ENETWORK",
        },
        count: null,
      };
    }
    clearTimeout(timer);
    const raw = await res.text();
    if (!res.ok) {
      let parsed: Partial<PostgrestError> = {};
      try {
        parsed = raw ? (JSON.parse(raw) as Partial<PostgrestError>) : {};
      } catch {
        parsed = {};
      }
      return {
        data: null,
        error: {
          message: parsed.message || `http_${res.status}`,
          code: parsed.code || String(res.status),
          details: parsed.details ?? null,
          hint: parsed.hint ?? null,
        },
        count: null,
      };
    }
    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        return {
          data: null,
          error: { message: "invalid_json_response", code: "EPARSE" },
          count: null,
        };
      }
    }
    return { data: data as T, error: null, count: null };
  }
}
