/**
 * Tests de l'isolation multi-tenant des actions d'administration (REA-M04-01).
 *
 * Preuve centrale : un admin du tenant A ne peut jamais cibler un utilisateur du tenant B.
 *   (1) isSameTenant — même tenant → true ; tenant différent → false ;
 *       user introuvable → false ; DB non configurée → false (FAIL-CLOSED).
 *   (2) getUserTenant — résout depuis auth_credentials, null si absent/erreur.
 *   (3) listTenantUserIds — ne renvoie que les user_id du tenant demandé, [] si DB absente.
 *
 * On mocke lib/gpu1 (getGpu1Admin) pour injecter un FakeDb déterministe
 * (aucun réseau, aucune vraie DB), en réutilisant le mock in-memory de la gateway.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "@/lib/agent-gateway/test-helpers";

// Le client renvoyé par getGpu1Admin est remplacé par un FakeDb par test.
let fakeDb: FakeDb | null = null;

vi.mock("@/lib/gpu1", () => ({
  getGpu1Admin: () => fakeDb,
}));

// Import APRÈS le mock (les helpers capturent getGpu1Admin à l'appel, pas à l'import).
import { isSameTenant, getUserTenant, listTenantUserIds } from "./auth-admin";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const USER_A1 = "11111111-1111-4111-8111-111111111111";
const USER_A2 = "22222222-2222-4222-8222-222222222222";
const USER_B1 = "33333333-3333-4333-8333-333333333333";

function seedCredentials(): FakeDb {
  return new FakeDb({
    auth_credentials: [
      { user_id: USER_A1, tenant_id: TENANT_A, email: "a1@x", role: "admin" },
      { user_id: USER_A2, tenant_id: TENANT_A, email: "a2@x", role: "user" },
      { user_id: USER_B1, tenant_id: TENANT_B, email: "b1@x", role: "user" },
    ],
  });
}

beforeEach(() => {
  fakeDb = seedCredentials();
});

// ── (1) isSameTenant — cœur de l'isolation cross-tenant ──────────────────────
describe("isSameTenant — borne de tenant sur action admin", () => {
  it("cible du MÊME tenant que l'acteur → true", async () => {
    expect(await isSameTenant(TENANT_A, USER_A2)).toBe(true);
  });

  it("cible d'un AUTRE tenant → false (admin A ne peut pas toucher user B)", async () => {
    expect(await isSameTenant(TENANT_A, USER_B1)).toBe(false);
  });

  it("cible introuvable → false (fail-closed, jamais d'action sur user inconnu)", async () => {
    expect(await isSameTenant(TENANT_A, "99999999-9999-4999-8999-999999999999")).toBe(false);
  });

  it("Supabase non configuré (client null) → false (FAIL-CLOSED, pas d'autorisation par défaut)", async () => {
    fakeDb = null;
    expect(await isSameTenant(TENANT_A, USER_A2)).toBe(false);
  });

  it("paramètres vides → false", async () => {
    expect(await isSameTenant("", USER_A2)).toBe(false);
    expect(await isSameTenant(TENANT_A, "")).toBe(false);
  });
});

// ── (2) getUserTenant ────────────────────────────────────────────────────────
describe("getUserTenant — résolution depuis auth_credentials", () => {
  it("user connu → son tenant", async () => {
    expect(await getUserTenant(USER_B1)).toBe(TENANT_B);
  });

  it("user inconnu → null", async () => {
    expect(await getUserTenant("00000000-0000-4000-8000-000000000000")).toBe(null);
  });

  it("client null → null (jamais de throw)", async () => {
    fakeDb = null;
    expect(await getUserTenant(USER_A1)).toBe(null);
  });
});

// ── (3) listTenantUserIds ────────────────────────────────────────────────────
describe("listTenantUserIds — borne de lecture au tenant courant", () => {
  it("ne renvoie QUE les user_id du tenant demandé", async () => {
    const ids = await listTenantUserIds(TENANT_A);
    expect(ids.sort()).toEqual([USER_A1, USER_A2].sort());
    expect(ids).not.toContain(USER_B1);
  });

  it("tenant sans user → [] (on ne fuite rien)", async () => {
    expect(await listTenantUserIds("tenant-vide")).toEqual([]);
  });

  it("client null → [] (fail-closed)", async () => {
    fakeDb = null;
    expect(await listTenantUserIds(TENANT_A)).toEqual([]);
  });
});
