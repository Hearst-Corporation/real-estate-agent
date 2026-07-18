import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks des dépendances serveur de la route. Doivent être déclarés AVANT
// l'import de la route (hoisting vi.mock).
const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/gpu1", () => ({ getGpu1Admin: () => getSupabaseAdmin() }));
vi.mock("@/lib/providers/posthog", () => ({ captureServer: vi.fn() }));

import { POST, GET } from "@/app/api/leads/route";

const CLAIMS = { sub: "user-1", tenant_id: "tenant-1", role: "user", scope: [] };

/** Construit un mock du client supabase capturant l'insert. */
function makeSupabaseInsert(returnData: unknown, error: unknown = null) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: returnData, error }),
    }),
  });
  return { client: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

function req(body: unknown) {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
});

describe("POST /api/leads", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(req({ full_name: "X" }));
    expect(res.status).toBe(401);
  });

  it("400 si full_name manquant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(req({ kind: "acheteur" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("400 si full_name vide/espaces", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(req({ full_name: "   " }));
    expect(res.status).toBe(400);
  });

  it("201 + insert avec user_id + tenant_id (owner-check applicatif)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client, insert } = makeSupabaseInsert({ id: "lead-99" });
    getSupabaseAdmin.mockReturnValue(client);

    const res = await POST(req({ full_name: "Jane Doe", kind: "acheteur" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "lead-99" });

    // La ligne insérée porte bien le scope du user connecté.
    const inserted = insert.mock.calls[0][0];
    expect(inserted.user_id).toBe("user-1");
    expect(inserted.tenant_id).toBe("tenant-1");
    expect(inserted.full_name).toBe("Jane Doe");
    expect(inserted.status).toBe("nouveau"); // défaut
  });

  it("500 générique sans fuite de message DB si insert échoue", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client } = makeSupabaseInsert(null, { code: "23505", message: "duplicate key value" });
    getSupabaseAdmin.mockReturnValue(client);

    const res = await POST(req({ full_name: "Dup" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "create_failed" });
    // Le message DB brut ne doit JAMAIS remonter au client.
    expect(JSON.stringify(body)).not.toContain("duplicate key");
  });

  it("400 sur body non-JSON", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const bad = new Request("http://localhost/api/leads", {
      method: "POST",
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/leads", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("filtre par user_id + tenant_id et renvoie items", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const eqTenant = { order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: "l1" }], error: null }) }) };
    const eqUser = { eq: vi.fn().mockReturnValue(eqTenant) };
    const select = { eq: vi.fn().mockReturnValue(eqUser) };
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(select) }) };
    getSupabaseAdmin.mockReturnValue(client);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: "l1" }] });
    // 1er filtre = user_id, 2e = tenant_id
    expect(select.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqUser.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
