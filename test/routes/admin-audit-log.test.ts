/**
 * GET /api/admin/audit-log — preuve end-to-end de la borne multi-tenant (REA-M04-01).
 *
 * La logique auth-admin (isSameTenant / listTenantUserIds) tourne pour de vrai ; seul
 * l'accès DB est un FakeDb déterministe.
 *   - non authentifié                       → 401
 *   - non-admin                             → 403
 *   - admin, ?user_id d'un AUTRE tenant     → 403 CROSS-TENANT
 *   - admin, ?user_id de SON tenant         → 200, uniquement les lignes de ce user
 *   - admin, sans user_id                   → 200, uniquement les lignes des users de SON tenant
 *                                             (jamais celles du tenant B, ni les user_id NULL)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "@/lib/agent-gateway/test-helpers";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { GET } from "@/app/api/admin/audit-log/route";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const ADMIN_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";

function db(): FakeDb {
  return new FakeDb({
    auth_credentials: [
      { user_id: ADMIN_A, tenant_id: TENANT_A, email: "admin@a", role: "admin" },
      { user_id: USER_A, tenant_id: TENANT_A, email: "u@a", role: "user" },
      { user_id: USER_B, tenant_id: TENANT_B, email: "u@b", role: "user" },
    ],
    auth_audit_log: [
      { id: "e1", user_id: ADMIN_A, event: "login", ip: "1.1.1.1", user_agent: "x", meta: {}, created_at: "2026-07-18T10:00:00Z" },
      { id: "e2", user_id: USER_A, event: "login", ip: "1.1.1.2", user_agent: "x", meta: {}, created_at: "2026-07-18T10:01:00Z" },
      { id: "e3", user_id: USER_B, event: "login", ip: "2.2.2.2", user_agent: "x", meta: {}, created_at: "2026-07-18T10:02:00Z" },
      { id: "e4", user_id: null, event: "login_failed", ip: "9.9.9.9", user_agent: "x", meta: { email: "ghost@b" }, created_at: "2026-07-18T10:03:00Z" },
    ],
  });
}

function req(query = "") {
  return new Request(`http://localhost/api/admin/audit-log${query}`);
}

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
  getSupabaseAdmin.mockReturnValue(db());
});

describe("GET /api/admin/audit-log", () => {
  it("401 si pas de session", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("403 si role !== admin", async () => {
    getSession.mockResolvedValue({ sub: USER_A, tenant_id: TENANT_A, role: "user", scope: [] });
    expect((await GET(req())).status).toBe(403);
  });

  it("403 CROSS-TENANT : ?user_id d'un autre tenant", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await GET(req(`?user_id=${USER_B}`));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("400 si user_id malformé", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    expect((await GET(req("?user_id=nope"))).status).toBe(400);
  });

  it("200 : ?user_id de son tenant → seulement les lignes de ce user", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await GET(req(`?user_id=${USER_A}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows.map((r: { id: string }) => r.id)).toEqual(["e2"]);
  });

  it("200 : sans user_id → uniquement les users du tenant courant (jamais B, jamais NULL)", async () => {
    getSession.mockResolvedValue({ sub: ADMIN_A, tenant_id: TENANT_A, role: "admin", scope: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.rows.map((r: { id: string }) => r.id).sort();
    // e1 (admin A) + e2 (user A) seulement. Ni e3 (tenant B) ni e4 (user_id NULL).
    expect(ids).toEqual(["e1", "e2"]);
    expect(ids).not.toContain("e3");
    expect(ids).not.toContain("e4");
  });
});
