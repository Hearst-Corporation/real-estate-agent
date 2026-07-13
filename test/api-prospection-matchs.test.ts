import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { GET, POST } from "@/app/api/prospection/matchs/route";

const CLAIMS = { sub: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-1", role: "user", scope: [] };
const MATCH_UUID = "44444444-4444-4444-8444-444444444444";

function postReq(body: unknown) {
  return new Request("http://localhost/api/prospection/matchs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getReq() {
  return new Request("http://localhost/api/prospection/matchs");
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
});

describe("GET /api/prospection/matchs — scope tenant + user (anti-IDOR)", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(getReq() as never)).status).toBe(401);
  });

  it("le SELECT filtre tenant_id ET user_id", async () => {
    getSession.mockResolvedValue(CLAIMS);
    // chaîne : select → eq(tenant) → eq(user) → order → range (thenable)
    const range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
    const order = vi.fn().mockReturnValue({ range });
    const eqUser = vi.fn().mockReturnValue({ order });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqTenant });
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });

    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", CLAIMS.sub);
  });

  it("500 générique sans fuite du message DB", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const range = vi.fn().mockResolvedValue({ data: null, error: { message: "raw db leak" }, count: null });
    const order = vi.fn().mockReturnValue({ range });
    const eqUser = vi.fn().mockReturnValue({ order });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqTenant });
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });

    const res = await GET(getReq() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "fetch_failed" });
    expect(JSON.stringify(body)).not.toContain("raw db leak");
  });
});

describe("POST /api/prospection/matchs — feedback validation & ownership", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(postReq({ match_id: MATCH_UUID, verdict: "up" }) as never)).status).toBe(401);
  });

  it("400 si match_id absent ou non-UUID", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    expect((await POST(postReq({ verdict: "up" }) as never)).status).toBe(400);
    expect((await POST(postReq({ match_id: "nope", verdict: "up" }) as never)).status).toBe(400);
  });

  it("l'ownership check lit le match filtré par tenant_id + user_id", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: MATCH_UUID }, error: null });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqUser });
    const eqId = vi.fn().mockReturnValue({ eq: eqTenant });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((t: string) => (t === "prosp_matchs" ? { select } : { insert }));
    getSupabaseAdmin.mockReturnValue({ from });

    const res = await POST(postReq({ match_id: MATCH_UUID, verdict: "up" }) as never);
    expect(res.status).toBe(201);
    expect(eqId).toHaveBeenCalledWith("id", MATCH_UUID);
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", CLAIMS.sub);
  });

  it("404 si le match n'appartient pas au user (anti-IDOR)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqUser });
    const eqId = vi.fn().mockReturnValue({ eq: eqTenant });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });

    const res = await POST(postReq({ match_id: MATCH_UUID, verdict: "up" }) as never);
    expect(res.status).toBe(404);
  });
});
