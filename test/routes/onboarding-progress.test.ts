/**
 * Routes /api/onboarding/* — progression des visites guidées (W2).
 *
 * Prouve : 401 AVANT tout accès DB · identité (tenant/user) imposée par le
 * serveur et refusée depuis le navigateur · validation Zod stricte · upsert sur
 * la contrainte unique · dégradation HONNÊTE quand la migration 0059 n'est pas
 * appliquée (jamais un faux succès).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks déclarés AVANT l'import des routes (hoisting vi.mock).
const getSession = vi.fn();
const getGpu1Admin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/gpu1", () => ({ getGpu1Admin: () => getGpu1Admin() }));

import { GET, PUT } from "@/app/api/onboarding/progress/route";
import { POST as RESET } from "@/app/api/onboarding/reset/route";

const CLAIMS = { sub: "user-1", tenant_id: "tenant-1", role: "user", scope: [] };
const MISSING = { code: "42P01", message: "relation does not exist" };
const MISSING_PGRST = { code: "PGRST205", message: "not found in schema cache" };

/** Chaîne PostgREST « thenable » qui résout `{ data, error }`. */
function terminal(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "upsert", "delete", "single"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (onf: (v: unknown) => unknown) => Promise.resolve(onf({ data, error }));
  return chain;
}

function client(term: Record<string, unknown>) {
  return { from: vi.fn(() => term) };
}

const getReq = (qs = "") => new Request(`http://localhost/api/onboarding/progress${qs}`);

const jsonReq = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const putReq = (body: unknown) =>
  jsonReq("http://localhost/api/onboarding/progress", "PUT", body);
const resetReq = (body: unknown) =>
  jsonReq("http://localhost/api/onboarding/reset", "POST", body);

beforeEach(() => {
  getSession.mockReset();
  getGpu1Admin.mockReset();
});

// ── 401 fail-closed ──────────────────────────────────────────────────────────

describe("session obligatoire — 401 AVANT tout accès DB", () => {
  it("GET sans session → 401, DB jamais touchée", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("PUT sans session → 401, DB jamais touchée", async () => {
    getSession.mockResolvedValue(null);
    const res = await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 1 }) as never);
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("POST /reset sans session → 401, DB jamais touchée", async () => {
    getSession.mockResolvedValue(null);
    const res = await RESET(resetReq({ tour_key: "cockpit" }) as never);
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });
});

// ── Validation Zod ───────────────────────────────────────────────────────────

describe("validation Zod stricte", () => {
  beforeEach(() => getSession.mockResolvedValue(CLAIMS));

  it("400 sur status hors enum", async () => {
    const res = await PUT(putReq({ tour_key: "cockpit", status: "pending", current_step: 0 }) as never);
    expect(res.status).toBe(400);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("400 sur tour_key non-slug (barrière anti-PII)", async () => {
    const res = await PUT(
      putReq({ tour_key: "Jean Dupont <jean@x.fr>", status: "in_progress", current_step: 0 }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("400 sur current_step négatif ou hors bornes", async () => {
    expect(
      (await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: -1 }) as never)).status,
    ).toBe(400);
    expect(
      (await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 9999 }) as never)).status,
    ).toBe(400);
  });

  it("400 sur corps non-JSON", async () => {
    const req = new Request("http://localhost/api/onboarding/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{{{",
    });
    expect((await PUT(req as never)).status).toBe(400);
  });

  it("400 sur tour_key invalide en query GET", async () => {
    const res = await GET(getReq("?tour_key=NOPE%20NOPE") as never);
    expect(res.status).toBe(400);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });
});

// ── Identité imposée par le serveur ──────────────────────────────────────────

describe("tenant_id / user_id viennent du SERVEUR, jamais du navigateur", () => {
  beforeEach(() => getSession.mockResolvedValue(CLAIMS));

  it("PUT refuse (400) un corps qui tente d'injecter tenant_id / user_id", async () => {
    const res = await PUT(
      putReq({
        tour_key: "cockpit",
        status: "in_progress",
        current_step: 2,
        tenant_id: "tenant-PIRATE",
        user_id: "user-PIRATE",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("POST /reset refuse (400) un corps qui tente d'injecter user_id", async () => {
    const res = await RESET(resetReq({ tour_key: "cockpit", user_id: "user-PIRATE" }) as never);
    expect(res.status).toBe(400);
  });

  it("l'upsert écrit EXACTEMENT le tenant/user des claims", async () => {
    const term = terminal({ tour_key: "cockpit", tour_version: 1, status: "in_progress", current_step: 2 });
    getGpu1Admin.mockReturnValue(client(term));

    const res = await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 2 }) as never);
    expect(res.status).toBe(200);

    const payload = (term.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.tenant_id).toBe("tenant-1");
    expect(payload.user_id).toBe("user-1");
    // Upsert ciblé sur la contrainte UNIQUE de 0059.
    const opts = (term.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as { onConflict: string };
    expect(opts.onConflict).toBe("tenant_id,user_id,tour_key,tour_version");
  });

  it("le GET filtre explicitement tenant_id + user_id (owner-check applicatif)", async () => {
    const term = terminal([]);
    getGpu1Admin.mockReturnValue(client(term));

    await GET(getReq("?tour_key=cockpit") as never);
    expect(term.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(term.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(term.eq).toHaveBeenCalledWith("tour_key", "cockpit");
  });

  it("le reset DELETE est borné au tenant + user des claims", async () => {
    const term = terminal(null);
    getGpu1Admin.mockReturnValue(client(term));

    const res = await RESET(resetReq({ tour_key: "cockpit" }) as never);
    expect(res.status).toBe(200);
    expect(term.delete).toHaveBeenCalled();
    expect(term.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(term.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(await res.json()).toMatchObject({ cleared: true, sync: "synced", persisted: true });
  });

  it("aucune colonne d'identité ni de PII n'est renvoyée au client", async () => {
    const term = terminal([{ tour_key: "cockpit", tour_version: 1, status: "completed", current_step: 4 }]);
    getGpu1Admin.mockReturnValue(client(term));

    await GET(getReq() as never);
    const cols = (term.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(cols).not.toContain("tenant_id");
    expect(cols).not.toContain("user_id");
  });
});

// ── DB non configurée ────────────────────────────────────────────────────────

describe("DB non configurée → message neutre", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(null);
  });

  it("GET → 503 database_not_configured", async () => {
    const res = await GET(getReq() as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_configured" });
  });

  it("PUT → 503 database_not_configured", async () => {
    const res = await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 0 }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_configured" });
  });
});

// ── Dégradation honnête : 0059 non appliquée ─────────────────────────────────

describe("migration 0059 NON appliquée — jamais un faux succès", () => {
  beforeEach(() => getSession.mockResolvedValue(CLAIMS));

  it("GET → entries vides + sync unsynced + persisted false", async () => {
    getGpu1Admin.mockReturnValue(client(terminal(null, MISSING)));
    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entries: [],
      sync: "unsynced",
      persisted: false,
      reason: "tour_progress_schema_missing",
    });
  });

  it("PUT → entry NULL, persisted false : rien ne prétend avoir été enregistré", async () => {
    getGpu1Admin.mockReturnValue(client(terminal(null, MISSING_PGRST)));
    const res = await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 3 }) as never);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.sync).toBe("unsynced");
    expect(body.entry).toBeNull();
    expect(body.reason).toBe("tour_progress_schema_missing");
  });

  it("POST /reset → cleared false + unsynced (aucun effacement prétendu)", async () => {
    getGpu1Admin.mockReturnValue(client(terminal(null, MISSING)));
    const res = await RESET(resetReq({ tour_key: "cockpit" }) as never);
    const body = await res.json();
    expect(body.cleared).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.sync).toBe("unsynced");
  });
});

// ── Erreur DB réelle → 500 générique ─────────────────────────────────────────

describe("erreur DB réelle → 500 générique, aucun détail fuité", () => {
  beforeEach(() => getSession.mockResolvedValue(CLAIMS));

  it("GET → 500 internal_error sans message DB", async () => {
    getGpu1Admin.mockReturnValue(
      client(terminal(null, { code: "57014", message: "canceling statement due to timeout" })),
    );
    const res = await GET(getReq() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "internal_error" });
    expect(JSON.stringify(body)).not.toContain("timeout");
  });

  it("PUT → 500 internal_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getGpu1Admin.mockReturnValue(client(terminal(null, { code: "23514", message: "check violation" })));
    const res = await PUT(putReq({ tour_key: "cockpit", status: "completed", current_step: 5 }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
  });
});

// ── Chemin nominal ───────────────────────────────────────────────────────────

describe("chemin nominal — table présente", () => {
  beforeEach(() => getSession.mockResolvedValue(CLAIMS));

  it("GET renvoie la progression avec sync synced", async () => {
    const row = {
      tour_key: "cockpit",
      tour_version: 1,
      status: "in_progress",
      current_step: 2,
      started_at: "2026-07-18T10:00:00Z",
      completed_at: null,
      dismissed_at: null,
      last_seen_at: "2026-07-18T10:05:00Z",
      updated_at: "2026-07-18T10:05:00Z",
    };
    getGpu1Admin.mockReturnValue(client(terminal([row])));
    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [row], sync: "synced", persisted: true });
  });

  it("PUT accepte les 4 statuts de l'enum", async () => {
    for (const status of ["not_started", "in_progress", "completed", "dismissed"]) {
      getGpu1Admin.mockReturnValue(client(terminal({ tour_key: "cockpit", status })));
      const res = await PUT(putReq({ tour_key: "cockpit", status, current_step: 0 }) as never);
      expect(res.status).toBe(200);
      expect((await res.json()).sync).toBe("synced");
    }
  });

  it("tour_version par défaut = 1 quand omis", async () => {
    const term = terminal({ tour_key: "cockpit" });
    getGpu1Admin.mockReturnValue(client(term));
    await PUT(putReq({ tour_key: "cockpit", status: "in_progress", current_step: 0 }) as never);
    const payload = (term.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.tour_version).toBe(1);
  });
});
