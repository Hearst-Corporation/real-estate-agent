/**
 * POST /api/admin/mfa-reset — preuve end-to-end de l'isolation multi-tenant (REA-M04-01).
 *
 * Gating complet vérifié sur la vraie route (la logique isSameTenant tourne pour de vrai,
 * seul l'accès DB est un FakeDb déterministe) :
 *   - non authentifié             → 401
 *   - authentifié non-admin       → 403 (aucun reset)
 *   - admin, body invalide        → 400
 *   - admin tenant A → user B     → 403 CROSS-TENANT (disableMfa jamais appelé)
 *   - admin tenant A → user A     → 200 (disableMfa appelé une fois avec le bon userId)
 *
 * Style aligné sur test/api-leads.test.ts (mocks getSession/getSupabaseAdmin/posthog).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "@/lib/agent-gateway/test-helpers";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();
// vi.fn typé pour matcher disableMfa(userId: string) : Promise<boolean> — garde
// l'API mock (.mockClear / toHaveBeenCalledWith) tout en satisfaisant l'arité au typecheck.
const disableMfa = vi.fn((userId: string): Promise<boolean> => {
  void userId;
  return Promise.resolve(true);
});

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));
vi.mock("@/lib/server/mfa-store", () => ({ disableMfa: (id: string) => disableMfa(id) }));
vi.mock("@/lib/providers/posthog", () => ({ captureServer: vi.fn() }));
vi.mock("@/lib/server/audit-log", () => ({ recordAuthEvent: vi.fn(async () => {}) }));

import { POST } from "@/app/api/admin/mfa-reset/route";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const ADMIN_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";

function credsDb(): FakeDb {
  return new FakeDb({
    auth_credentials: [
      { user_id: ADMIN_A, tenant_id: TENANT_A, email: "admin@a", role: "admin" },
      { user_id: USER_A, tenant_id: TENANT_A, email: "u@a", role: "user" },
      { user_id: USER_B, tenant_id: TENANT_B, email: "u@b", role: "user" },
    ],
  });
}

function req(body: unknown) {
  return new Request("http://localhost/api/admin/mfa-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
  disableMfa.mockClear();
  getSupabaseAdmin.mockReturnValue(credsDb());
});

describe("POST /api/admin/mfa-reset", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(req({ userId: USER_A }));
    expect(res.status).toBe(401);
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("403 si role !== admin (aucun reset)", async () => {
    getSession.mockResolvedValue({ sub: USER_A, tenant_id: TENANT_A, role: "user", scope: [] });
    const res = await POST(req({ userId: USER_A }));
    expect(res.status).toBe(403);
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("400 si userId non-uuid", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await POST(req({ userId: "nope" }));
    expect(res.status).toBe(400);
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("403 CROSS-TENANT : admin A ne peut pas reset un user du tenant B", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await POST(req({ userId: USER_B }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(disableMfa).not.toHaveBeenCalled(); // preuve : aucune écriture cross-tenant
  });

  it("200 : admin A reset un user de SON tenant", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await POST(req({ userId: USER_A }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, userId: USER_A });
    expect(disableMfa).toHaveBeenCalledTimes(1);
    expect(disableMfa).toHaveBeenCalledWith(USER_A);
  });
});
