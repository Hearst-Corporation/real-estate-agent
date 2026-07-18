import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const getGpu1Admin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/gpu1", () => ({ getGpu1Admin: () => getGpu1Admin() }));

import type { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/visits/[id]/report/route";

const CLAIMS = { sub: "user-1", tenant_id: "tenant-1", role: "user", scope: [] };
const VISIT_ID = "11111111-1111-1111-1111-111111111111";

function params() {
  return { params: Promise.resolve({ id: VISIT_ID }) };
}

function req(body: unknown) {
  return new Request(`http://localhost/api/visits/${VISIT_ID}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID = {
  interest: "interesse",
  outcome: "a_relancer",
  positives: "Beau volume",
  objections: "Prix un peu haut",
  next_action: "Envoyer une offre",
  price_discussed: 450000,
};

/**
 * Mock du client GPU1 : la visite est-elle possédée (owner-check),
 * et upsert du CR (data/error configurables pour simuler table absente).
 */
function makeDb(opts: {
  ownedVisit?: boolean;
  upsertData?: unknown;
  upsertError?: { code?: string } | null;
}) {
  const { ownedVisit = true, upsertData = { id: "rep-1", visit_id: VISIT_ID }, upsertError = null } =
    opts;

  const visitChain = {
    select: () => visitChain,
    eq: () => visitChain,
    maybeSingle: async () => ({ data: ownedVisit ? { id: VISIT_ID } : null, error: null }),
  };
  const upsertChain = {
    select: () => upsertChain,
    single: async () => ({ data: upsertError ? null : upsertData, error: upsertError }),
  };
  return {
    from: (table: string) => {
      if (table === "visits") return visitChain;
      return { upsert: () => upsertChain };
    },
  };
}

beforeEach(() => {
  getSession.mockReset();
  getGpu1Admin.mockReset();
});

describe("POST /api/visits/[id]/report", () => {
  it("401 sans session (avant tout accès DB)", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(401);
    expect(getGpu1Admin).not.toHaveBeenCalled();
  });

  it("503 database_not_configured si pas de client", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(null);
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(503);
  });

  it("400 si interest hors enum", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({}));
    const res = await POST(req({ ...VALID, interest: "chaud" }), params());
    expect(res.status).toBe(400);
  });

  it("400 si outcome hors enum", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({}));
    const res = await POST(req({ ...VALID, outcome: "peut-etre" }), params());
    expect(res.status).toBe(400);
  });

  it("400 si interest manquant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({}));
    const res = await POST(req({ outcome: "abandon" }), params());
    expect(res.status).toBe(400);
  });

  it("400 si price_discussed négatif", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({}));
    const res = await POST(req({ ...VALID, price_discussed: -1 }), params());
    expect(res.status).toBe(400);
  });

  it("404 si la visite n'appartient pas au user+tenant (owner-check)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({ ownedVisit: false }));
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(404);
  });

  it("200 et persiste le CR quand tout est valide", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({}));
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.visit_id).toBe(VISIT_ID);
  });

  it("503 unavailable (dégradation honnête) si table 0051 absente", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue(makeDb({ upsertError: { code: "PGRST205" } }));
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("unavailable");
  });
});

describe("GET /api/visits/[id]/report", () => {
  it("401 sans session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(req(VALID), params());
    expect(res.status).toBe(401);
  });

  it("404 si visite non possédée", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getGpu1Admin.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
      }),
    });
    const res = await GET(req(VALID), params());
    expect(res.status).toBe(404);
  });
});
