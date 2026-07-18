import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/lib/agent-gateway/test-helpers";
import { PROPERTY_STATUSES } from "@/lib/crm/format";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { PATCH } from "@/app/api/properties/[id]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "tenant-alpha";
const PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const CLAIMS = { sub: USER_ID, tenant_id: TENANT_ID, role: "user", scope: [] };

function seedDb() {
  const row = {
    id: PROPERTY_ID,
    user_id: USER_ID,
    tenant_id: TENANT_ID,
    status: "prospect",
    title: "Bien initial",
  };
  return { db: new FakeDb({ properties: [row] }), row };
}

function request(body: unknown, raw = false) {
  return new Request(`http://localhost/api/properties/${PROPERTY_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: PROPERTY_ID }) };

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
  getSession.mockResolvedValue(CLAIMS);
});

describe("PATCH /api/properties/[id] — validation du statut", () => {
  it.each(PROPERTY_STATUSES)("accepte le statut canonique %s", async (status) => {
    const { db, row } = seedDb();
    getSupabaseAdmin.mockReturnValue(db);

    const response = await PATCH(request({ status }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: PROPERTY_ID });
    expect(row.status).toBe(status);
  });

  it.each(["nope", "", null, 42, true, {}, []])(
    "refuse le statut invalide %j avant toute mutation",
    async (status) => {
      const { db, row } = seedDb();
      getSupabaseAdmin.mockReturnValue(db);

      const response = await PATCH(
        request({ status, title: "Ne doit pas être écrit" }),
        context,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_status" });
      expect(row).toMatchObject({ status: "prospect", title: "Bien initial" });
    },
  );

  it("refuse un body sans champ modifiable", async () => {
    const { db, row } = seedDb();
    getSupabaseAdmin.mockReturnValue(db);
    const response = await PATCH(request({ unknown: true }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
    expect(row.status).toBe("prospect");
  });

  it("refuse un JSON malformé", async () => {
    const { db, row } = seedDb();
    getSupabaseAdmin.mockReturnValue(db);
    const response = await PATCH(request("{not json", true), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
    expect(row.status).toBe("prospect");
  });

  it("répond 401 sans session et ne consulte pas la DB", async () => {
    getSession.mockResolvedValue(null);
    const response = await PATCH(request({ status: "vendu" }), context);
    expect(response.status).toBe(401);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("ne modifie pas un bien d'un autre tenant", async () => {
    const row = {
      id: PROPERTY_ID,
      user_id: USER_ID,
      tenant_id: "tenant-beta",
      status: "prospect",
    };
    getSupabaseAdmin.mockReturnValue(new FakeDb({ properties: [row] }));
    const response = await PATCH(request({ status: "vendu" }), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "update_failed" });
    expect(row.status).toBe("prospect");
  });
});
