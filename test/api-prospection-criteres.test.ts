import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks serveur — déclarés AVANT l'import de la route (hoisting vi.mock).
const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { POST, DELETE } from "@/app/api/prospection/criteres/route";

const CLAIMS = { sub: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-1", role: "user", scope: [] };
const LEAD_UUID = "22222222-2222-4222-8222-222222222222";
const CRIT_UUID = "33333333-3333-4333-8333-333333333333";

/** Mock supabase capturant l'insert (insert→select→single). */
function makeInsert(returnData: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return { client: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

/** Mock supabase capturant l'update chaîné (.eq×3) pour le DELETE. */
function makeUpdate(error: unknown = null) {
  const eqUser = vi.fn().mockResolvedValue({ error });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqUser });
  const eqId = vi.fn().mockReturnValue({ eq: eqTenant });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  return { client: { from: vi.fn().mockReturnValue({ update }) }, update, eqId, eqTenant, eqUser };
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/prospection/criteres", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
});

describe("POST /api/prospection/criteres — auth & validation", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(postReq({ nom: "X" }) as never);
    expect(res.status).toBe(401);
  });

  it("400 si nom manquant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ budget_min: 100 }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("400 si budget_min > budget_max", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", budget_min: 500000, budget_max: 300000 }) as never);
    expect(res.status).toBe(400);
  });

  it("400 si surface_min > surface_max", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", surface_min: 120, surface_max: 40 }) as never);
    expect(res.status).toBe(400);
  });

  it("400 si pieces_min > pieces_max", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", pieces_min: 5, pieces_max: 2 }) as never);
    expect(res.status).toBe(400);
  });

  it("400 sur budget NaN / négatif", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const nan = await POST(postReq({ nom: "Jean", budget_min: "abc" }) as never);
    expect(nan.status).toBe(400);
    const neg = await POST(postReq({ nom: "Jean", budget_min: -100 }) as never);
    expect(neg.status).toBe(400);
  });

  it("400 sur coordonnées de zone invalides (lat sans lng)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", zones: [{ label: "Nice", lat: 43.7 }] }) as never);
    expect(res.status).toBe(400);
  });

  it("400 sur latitude hors bornes", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", zones: [{ label: "X", lat: 200, lng: 5 }] }) as never);
    expect(res.status).toBe(400);
  });

  it("400 sur zone entièrement vide (ni label ni cp ni ville)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", zones: [{ rayon_km: 10 }] }) as never);
    expect(res.status).toBe(400);
  });

  it("400 sur préférence hors enum indifferent|requis|exclu", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    const res = await POST(postReq({ nom: "Jean", terrasse: "obligatoire" }) as never);
    expect(res.status).toBe(400);
  });

  it("201 + insert porte user_id + tenant_id du user connecté (owner-check applicatif)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client, insert } = makeInsert({ id: CRIT_UUID });
    getSupabaseAdmin.mockReturnValue(client);

    const res = await POST(
      postReq({
        nom: "Jean Dupont",
        lead_id: LEAD_UUID,
        budget_min: 200000,
        budget_max: 400000,
        surface_min: 50,
        surface_max: 120,
        terrasse: "requis",
        parking: "exclu",
        zones: [{ label: "Nice", cp: "06000", lat: 43.7, lng: 7.26, rayon_km: 5 }],
      }) as never,
    );
    expect(res.status).toBe(201);
    const inserted = insert.mock.calls[0][0];
    expect(inserted.user_id).toBe(CLAIMS.sub);
    expect(inserted.tenant_id).toBe("tenant-1");
    expect(inserted.terrasse).toBe("requis");
    expect(inserted.parking).toBe("exclu");
  });

  it("500 générique sans fuite du message DB si insert échoue", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client } = makeInsert(null, { code: "23505", message: "duplicate key value violates unique" });
    getSupabaseAdmin.mockReturnValue(client);

    const res = await POST(postReq({ nom: "Dup" }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "create_failed" });
    expect(JSON.stringify(body)).not.toContain("duplicate key");
  });
});

describe("DELETE /api/prospection/criteres — owner-check & validation id", () => {
  function delReq(id: string | null) {
    const url = id === null ? "http://localhost/api/prospection/criteres" : `http://localhost/api/prospection/criteres?id=${id}`;
    return new Request(url, { method: "DELETE" });
  }

  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    const res = await DELETE(delReq(CRIT_UUID) as never);
    expect(res.status).toBe(401);
  });

  it("400 si id absent ou non-UUID", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    expect((await DELETE(delReq(null) as never)).status).toBe(400);
    expect((await DELETE(delReq("not-a-uuid") as never)).status).toBe(400);
  });

  it("filtre id + tenant_id + user_id (owner-check applicatif, anti-IDOR)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client, eqId, eqTenant, eqUser } = makeUpdate();
    getSupabaseAdmin.mockReturnValue(client);

    const res = await DELETE(delReq(CRIT_UUID) as never);
    expect(res.status).toBe(200);
    expect(eqId).toHaveBeenCalledWith("id", CRIT_UUID);
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", CLAIMS.sub);
  });

  it("500 générique sans fuite si update échoue", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { client } = makeUpdate({ code: "XX000", message: "internal db detail" });
    getSupabaseAdmin.mockReturnValue(client);

    const res = await DELETE(delReq(CRIT_UUID) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "delete_failed" });
    expect(JSON.stringify(body)).not.toContain("internal db detail");
  });
});
