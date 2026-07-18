import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks déclarés AVANT l'import des routes (hoisting vi.mock).
const getSession = vi.fn();
const getGpu1Admin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/gpu1", () => ({ getGpu1Admin: () => getGpu1Admin() }));

import { GET } from "@/app/api/approvals/route";
import { POST } from "@/app/api/approvals/[id]/route";

const CLAIMS = { sub: "user-1", tenant_id: "tenant-1", role: "user", scope: [] };
const APPROVAL_ID = "11111111-2222-3333-4444-555555555555";

/** Terminal thenable qui résout `{ data, error }` (liste PostgREST). */
function listTerminal(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (onf: (v: unknown) => unknown) =>
    Promise.resolve(onf({ data, error }));
  return chain;
}

function getReq(status?: string) {
  const url = status
    ? `http://localhost/api/approvals?status=${status}`
    : "http://localhost/api/approvals";
  return new Request(url);
}

function postReq(body: unknown) {
  return new Request(`http://localhost/api/approvals/${APPROVAL_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getSession.mockReset();
  getGpu1Admin.mockReset();
});

describe("GET /api/approvals", () => {
  it("401 si pas de session (avant tout accès DB)", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("400 sur statut invalide", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue({});
    const res = await GET(getReq("garbage"));
    expect(res.status).toBe(400);
  });

  it("503 si DB non configurée", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(503);
  });

  it("filtre par tenant_id + status et renvoie items", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const term = listTerminal([{ id: "a1", tenant_id: "tenant-1", status: "pending" }]);
    const client = { from: vi.fn(() => term) };
    getGpu1Admin.mockReturnValue(client);

    const res = await GET(getReq("pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("a1");
    // owner-check : filtrage tenant_id + status explicites.
    expect(term.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(term.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("état UNAVAILABLE honnête si la table n'est pas déployée (erreur DB)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const term = listTerminal(null, { code: "42P01", message: "relation does not exist" });
    getGpu1Admin.mockReturnValue({ from: vi.fn(() => term) });

    const res = await GET(getReq("pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ unavailable: true, items: [] });
    // Aucun message DB brut ne fuit.
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
  });
});

describe("POST /api/approvals/[id]", () => {
  it("401 si pas de session (avant tout accès DB)", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(postReq({ decision: "approve" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("400 si id non-UUID", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const res = await POST(postReq({ decision: "approve" }), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("400 si décision invalide (Zod)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue({});
    const res = await POST(postReq({ decision: "maybe" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(400);
  });

  it("404 si l'approbation n'existe pas pour ce tenant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const found: Record<string, unknown> = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    found.select = vi.fn(() => found);
    found.eq = vi.fn(() => found);
    getGpu1Admin.mockReturnValue({ from: vi.fn(() => found) });

    const res = await POST(postReq({ decision: "approve" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(404);
    // owner-check tenant appliqué à la recherche.
    expect(found.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(found.eq).toHaveBeenCalledWith("id", APPROVAL_ID);
  });

  it("409 si déjà tranchée (status ≠ pending)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const found: Record<string, unknown> = {
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: APPROVAL_ID, status: "approved" },
        error: null,
      }),
    };
    found.select = vi.fn(() => found);
    found.eq = vi.fn(() => found);
    getGpu1Admin.mockReturnValue({ from: vi.fn(() => found) });

    const res = await POST(postReq({ decision: "reject" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(409);
  });

  it("200 approve : claim atomique pending→approved avec owner-check + décideur", async () => {
    getSession.mockResolvedValue(CLAIMS);
    // Un seul builder (from() unique) : lookup (select→maybeSingle) puis claim
    // (update→...→maybeSingle). maybeSingle résout d'abord la ligne pending, puis
    // le claim réussi.
    const updatePatch = vi.fn();
    const t: Record<string, unknown> = {
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { id: APPROVAL_ID, status: "pending" }, error: null })
        .mockResolvedValueOnce({ data: { id: APPROVAL_ID }, error: null }),
    };
    t.select = vi.fn(() => t);
    t.eq = vi.fn(() => t);
    t.update = vi.fn((patch: unknown) => { updatePatch(patch); return t; });
    getGpu1Admin.mockReturnValue({ from: vi.fn(() => t) });

    const res = await POST(postReq({ decision: "approve" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "approved" });

    // claim conditionné à status='pending' + scope tenant/id → usage unique.
    expect(t.eq).toHaveBeenCalledWith("status", "pending");
    expect(t.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(t.eq).toHaveBeenCalledWith("id", APPROVAL_ID);
    // décideur persisté (traçabilité humaine).
    const patch = updatePatch.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("approved");
    expect(patch.decided_by).toBe("user-1");
  });

  it("409 si le claim ne trouve plus la ligne pending (course perdue)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const t: Record<string, unknown> = {
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { id: APPROVAL_ID, status: "pending" }, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    };
    t.select = vi.fn(() => t);
    t.eq = vi.fn(() => t);
    t.update = vi.fn(() => t);
    getGpu1Admin.mockReturnValue({ from: vi.fn(() => t) });

    const res = await POST(postReq({ decision: "approve" }), ctx(APPROVAL_ID));
    expect(res.status).toBe(409);
  });
});
