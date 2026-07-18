import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/lib/agent-gateway/test-helpers";
import { PROPERTY_STATUSES } from "@/lib/crm/format";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/gpu1", () => ({ getGpu1Admin: () => getSupabaseAdmin() }));

import { POST } from "@/app/api/properties/route";

const CLAIMS = {
  sub: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-alpha",
  role: "user",
  scope: [],
};

function request(status?: unknown) {
  return new Request("http://localhost/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Bien test",
      property_type: "appartement",
      address: "1 rue du Test",
      city: "Antibes",
      postal_code: "06600",
      ...(status === undefined ? {} : { status }),
    }),
  });
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
  getSession.mockResolvedValue(CLAIMS);
});

describe("POST /api/properties — validation du statut", () => {
  it("utilise prospect par défaut", async () => {
    const db = new FakeDb({ properties: [] });
    getSupabaseAdmin.mockReturnValue(db);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(db.tables.properties).toHaveLength(1);
    expect(db.tables.properties[0]).toMatchObject({
      status: "prospect",
      user_id: CLAIMS.sub,
      tenant_id: CLAIMS.tenant_id,
    });
  });

  it.each(PROPERTY_STATUSES)("accepte le statut canonique %s", async (status) => {
    const db = new FakeDb({ properties: [] });
    getSupabaseAdmin.mockReturnValue(db);

    const response = await POST(request(status));

    expect(response.status).toBe(201);
    expect(db.tables.properties[0]?.status).toBe(status);
  });

  it.each(["nope", "", null, 42, true, {}, []])(
    "refuse le statut invalide %j sans insertion",
    async (status) => {
      const db = new FakeDb({ properties: [] });
      getSupabaseAdmin.mockReturnValue(db);

      const response = await POST(request(status));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_status" });
      expect(db.tables.properties).toHaveLength(0);
    },
  );
});
