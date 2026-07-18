// lib/gpu1/postgrest.test.ts — Contrat du client PostgREST gpu1.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Gpu1PostgrestClient, type FetchLike } from "@/lib/gpu1/postgrest";

const BASE = "https://db.example.test/rest/v1";
const TOKEN = "super-secret-service-role-token-01234567890";

type Captured = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

/** Fabrique un fetch fake qui capture l'appel et renvoie une réponse contrôlée. */
function fakeFetch(
  captured: Captured[],
  response: {
    ok?: boolean;
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): FetchLike {
  return async (url, init) => {
    captured.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    });
    const hdrs = response.headers ?? {};
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: { get: (n: string) => hdrs[n.toLowerCase()] ?? null },
      text: async () => response.body ?? "[]",
    };
  };
}

function client(fetchImpl: FetchLike, timeoutMs?: number) {
  return new Gpu1PostgrestClient({ baseUrl: BASE, token: TOKEN, timeoutMs, fetchImpl });
}

afterEach(() => vi.restoreAllMocks());

describe("URL construction", () => {
  it("select simple → GET avec select=* et filtres eq encodés", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" }))
      .from("leads")
      .select("id,full_name")
      .eq("tenant_id", "t1")
      .eq("id", "abc");
    expect(cap).toHaveLength(1);
    expect(cap[0].method).toBe("GET");
    expect(cap[0].url).toContain(`${BASE}/leads?`);
    expect(cap[0].url).toContain("select=id%2Cfull_name");
    expect(cap[0].url).toContain("tenant_id=eq.t1");
    expect(cap[0].url).toContain("id=eq.abc");
  });

  it("order + limit + range → paramètres et header Range", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" }))
      .from("annonces")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(20, 39);
    expect(cap[0].url).toContain("order=created_at.desc");
    expect(cap[0].headers.Range).toBe("20-39");
    expect(cap[0].headers.Prefer).toContain("count=exact");
  });

  it("in() sérialise une liste PostgREST", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" }))
      .from("tasks")
      .select("id")
      .in("status", ["open", "snoozed"]);
    expect(decodeURIComponent(cap[0].url)).toContain("status=in.(open,snoozed)");
  });

  it("not(col,is,null) → not.is.null", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" }))
      .from("leads")
      .select("id")
      .not("enriched_at", "is", null);
    expect(decodeURIComponent(cap[0].url)).toContain("enriched_at=not.is.null");
  });

  it("or() produit une expression or=(…)", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" }))
      .from("prosp_optout")
      .select("email_hash")
      .eq("tenant_id", "t1")
      .or("email_hash.eq.h1,telephone_hash.eq.h2");
    expect(cap[0].url).toContain("or=(email_hash.eq.h1,telephone_hash.eq.h2)");
  });

  it("refuse un nom de colonne non sûr (anti-injection)", async () => {
    const cap: Captured[] = [];
    expect(() =>
      client(fakeFetch(cap))
        .from("leads")
        .select("id")
        .eq("id; drop table leads", "x"),
    ).toThrow(/colonne invalide/i);
  });
});

describe("headers & auth", () => {
  it("envoie Authorization Bearer avec le token", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" })).from("leads").select("id");
    expect(cap[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(cap[0].headers.Accept).toBe("application/json");
  });
});

describe("mutations & Prefer", () => {
  it("insert().select() → POST, body JSON, Prefer return=representation", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(fakeFetch(cap, { body: '[{"id":"new"}]' }))
      .from("leads")
      .insert({ full_name: "X", tenant_id: "t1" })
      .select();
    expect(cap[0].method).toBe("POST");
    expect(JSON.parse(cap[0].body as string)).toEqual({ full_name: "X", tenant_id: "t1" });
    expect(cap[0].headers.Prefer).toContain("return=representation");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: "new" }]);
  });

  it("insert() sans select → Prefer return=minimal", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "" })).from("audit").insert({ a: 1 });
    expect(cap[0].headers.Prefer).toContain("return=minimal");
  });

  it("update().eq() → PATCH avec filtre", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "" }))
      .from("leads")
      .update({ status: "won" })
      .eq("id", "l1")
      .eq("tenant_id", "t1");
    expect(cap[0].method).toBe("PATCH");
    expect(cap[0].url).toContain("id=eq.l1");
    expect(JSON.parse(cap[0].body as string)).toEqual({ status: "won" });
  });

  it("delete().in() → DELETE avec liste", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "" }))
      .from("visits")
      .delete()
      .in("id", ["a", "b"]);
    expect(cap[0].method).toBe("DELETE");
    expect(decodeURIComponent(cap[0].url)).toContain("id=in.(a,b)");
  });

  it("upsert() avec onConflict + ignoreDuplicates → on_conflict + resolution", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "" }))
      .from("prosp_optout")
      .upsert(
        { tenant_id: "t1", email_hash: "h" },
        { onConflict: "tenant_id,email_hash", ignoreDuplicates: true },
      );
    expect(cap[0].method).toBe("POST");
    expect(cap[0].url).toContain("on_conflict=tenant_id%2Cemail_hash");
    expect(cap[0].headers.Prefer).toContain("resolution=ignore-duplicates");
  });

  it("upsert() sans ignoreDuplicates → resolution=merge-duplicates", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "" }))
      .from("t")
      .upsert({ user_id: "u" }, { onConflict: "user_id" });
    expect(cap[0].headers.Prefer).toContain("resolution=merge-duplicates");
  });
});

describe("cardinalité single / maybeSingle", () => {
  it("single() → Accept object+json et data objet", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(fakeFetch(cap, { body: '{"id":"x"}' }))
      .from("leads")
      .select("*")
      .eq("id", "x")
      .single();
    expect(cap[0].headers.Accept).toBe("application/vnd.pgrst.object+json");
    expect(error).toBeNull();
    expect(data).toEqual({ id: "x" });
  });

  it("maybeSingle() → 0 ligne (406/PGRST116) neutralisé en data:null,error:null", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(
      fakeFetch(cap, { ok: false, status: 406, body: '{"code":"PGRST116","message":"0 rows"}' }),
    )
      .from("leads")
      .select("*")
      .eq("id", "none")
      .maybeSingle();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("single() sur erreur réelle → remonte l'erreur", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(
      fakeFetch(cap, { ok: false, status: 500, body: '{"message":"boom","code":"XX000"}' }),
    )
      .from("leads")
      .select("*")
      .single();
    expect(data).toBeNull();
    expect(error?.code).toBe("XX000");
    expect(error?.message).toBe("boom");
  });
});

describe("count via Content-Range", () => {
  it("parse Content-Range: 0-9/42", async () => {
    const cap: Captured[] = [];
    const { count } = await client(
      fakeFetch(cap, { body: "[]", headers: { "content-range": "0-9/42" } }),
    )
      .from("leads")
      .select("id", { count: "exact" });
    expect(count).toBe(42);
  });

  it("head:true → HEAD, pas de corps, count renvoyé", async () => {
    const cap: Captured[] = [];
    const { data, count } = await client(
      fakeFetch(cap, { body: "", headers: { "content-range": "*/7" } }),
    )
      .from("leads")
      .select("id", { count: "exact", head: true });
    expect(cap[0].method).toBe("HEAD");
    expect(data).toBeNull();
    // total "*/7" → 7
    expect(count).toBe(7);
  });
});

describe("erreurs HTTP / JSON", () => {
  it("réponse non-JSON en 200 → invalid_json_response", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(fakeFetch(cap, { body: "<html>oops" }))
      .from("leads")
      .select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("EPARSE");
  });

  it("erreur HTTP sans corps JSON → http_<status>", async () => {
    const cap: Captured[] = [];
    const { error } = await client(fakeFetch(cap, { ok: false, status: 502, body: "" }))
      .from("leads")
      .select("id");
    expect(error?.message).toBe("http_502");
  });
});

describe("timeout / abort", () => {
  it("abort → error request_timeout, jamais de throw", async () => {
    const abortingFetch: FetchLike = async (_u, init) => {
      // Simule un fetch qui rejette sur abort.
      return await new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => {
          const e = new Error("The operation was aborted");
          (e as Error & { name: string }).name = "AbortError";
          rej(e);
        });
      });
    };
    const { data, error } = await client(abortingFetch, 10).from("leads").select("id");
    expect(data).toBeNull();
    expect(error?.message).toBe("request_timeout");
    expect(error?.code).toBe("ETIMEDOUT");
  });

  it("passe bien un AbortSignal à fetch", async () => {
    const cap: Captured[] = [];
    await client(fakeFetch(cap, { body: "[]" })).from("leads").select("id");
    expect(cap[0].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("rpc", () => {
  it("rpc() → POST /rpc/<fn> avec args JSON", async () => {
    const cap: Captured[] = [];
    const { data, error } = await client(fakeFetch(cap, { body: '[{"ok":true}]' })).rpc(
      "verify_login",
      { p_email: "a@b.c", p_password: "x" },
    );
    expect(cap[0].method).toBe("POST");
    expect(cap[0].url).toBe(`${BASE}/rpc/verify_login`);
    expect(JSON.parse(cap[0].body as string)).toEqual({ p_email: "a@b.c", p_password: "x" });
    expect(error).toBeNull();
    expect(data).toEqual([{ ok: true }]);
  });

  it("rpc() erreur HTTP → error normalisée", async () => {
    const cap: Captured[] = [];
    const { error } = await client(
      fakeFetch(cap, { ok: false, status: 400, body: '{"message":"bad","code":"22P02"}' }),
    ).rpc("verify_login", {});
    expect(error?.code).toBe("22P02");
  });
});

describe("absence de fuite de token / PII", () => {
  it("le token n'apparaît jamais dans un message d'erreur", async () => {
    const cap: Captured[] = [];
    const { error } = await client(
      fakeFetch(cap, { ok: false, status: 500, body: '{"message":"boom"}' }),
    )
      .from("leads")
      .select("id");
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("Bearer");
  });

  it("le token n'apparaît pas dans l'erreur réseau", async () => {
    const throwingFetch: FetchLike = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const { error } = await client(throwingFetch).from("leads").select("id");
    expect(error?.message).toBe("network_error");
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
