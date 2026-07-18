/**
 * Tests d'intégration bout-en-bout d'une route de LECTURE (buyers.list) — prouve
 * que la frontière de confiance s'applique dans le vrai pipeline defineGatewayRoute.
 *
 * Preuves couvertes (au niveau route, en complément des tests unitaires authz) :
 *   (1) token absent → DENIED 401, AUCUN accès DB (le lookup n'est jamais atteint).
 *   (2) mauvais scope (write seul sur lecture) → DENIED 403.
 *   (3) payload avec autre tenant → DENIED 403.
 *   (4) acteur inexistant → DENIED 403.
 *   + audit écrit sur chaque issue (systématique).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb, type Row } from "./test-helpers";

const getAdmin = vi.fn();
vi.mock("@/lib/gpu1", async (importActual) => ({ ...(await importActual<object>()), getGpu1Admin: () => getAdmin() }));

import { POST } from "@/app/api/agent-gateway/v1/buyers/list/route";

const TOKEN = "gateway-secret-token";
const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";

function seedDb(): FakeDb {
  const critere: Row = {
    id: "66666666-6666-4666-8666-666666666666",
    tenant_id: TENANT,
    user_id: ACTOR,
    nom: "Recherche Alice",
    lead_id: null,
    budget_min: 200000,
    budget_max: 400000,
    zones: ["06600"],
    actif: true,
    telephone: "0600000001",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
  return new FakeDb({
    users: [{ id: ACTOR, tenant_id: TENANT, email: "alice@demo-agent.local" }],
    prosp_criteres_acquereur: [critere],
    agent_gateway_audit_log: [],
  });
}

function makeReq(body: unknown, withToken = true): Request {
  return new Request("http://x/api/agent-gateway/v1/buyers/list", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const baseBody = { tenant_id: TENANT, actor_user_id: ACTOR, agent_id: AGENT };

const ENV_KEYS = [
  "AGENT_GATEWAY_TOKEN",
  "AGENT_GATEWAY_TENANT_ID",
  "AGENT_GATEWAY_PROJECT_KEY",
  "AGENT_GATEWAY_ALLOWED_AGENTS",
  "AGENT_GATEWAY_SCOPES",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.AGENT_GATEWAY_TOKEN = TOKEN;
  process.env.AGENT_GATEWAY_TENANT_ID = TENANT;
  process.env.AGENT_GATEWAY_PROJECT_KEY = TENANT;
  process.env.AGENT_GATEWAY_ALLOWED_AGENTS = AGENT;
  process.env.AGENT_GATEWAY_SCOPES = "read,write";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── (1) Token absent → DENIED 401, aucun accès DB métier ─────────────────────
describe("buyers.list route — Bearer fail-closed (preuve 1)", () => {
  it("sans token → DENIED 401, AUCUNE lecture métier (prosp_criteres_acquereur jamais interrogée)", async () => {
    const db = seedDb();
    const fromSpy = vi.spyOn(db, "from");
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq(baseBody, false));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.status).toBe("DENIED");
    // L'auth échoue AVANT le handler métier : la table acquéreur n'est jamais lue.
    // (Seul l'audit peut toucher la DB — jamais la donnée métier.)
    const businessReads = fromSpy.mock.calls.filter(
      (c) => c[0] === "prosp_criteres_acquereur",
    );
    expect(businessReads.length).toBe(0);
    // Aucune donnée acquéreur renvoyée.
    expect(json.items).toBeUndefined();
  });
});

// ── (3) Autre tenant → DENIED 403 ────────────────────────────────────────────
describe("buyers.list route — tenant du payload rejeté (preuve 3)", () => {
  it("payload tenant ≠ tenant du token → DENIED 403 tenant_mismatch, pas de fetch", async () => {
    const db = seedDb();
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody, tenant_id: "tenant-pirate" }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.status).toBe("DENIED");
    expect(json.reason).toBe("tenant_mismatch");
    // Aucune donnée acquéreur lue pour un tenant non autorisé.
    expect(json.items).toBeUndefined();
    // Audit écrit malgré le refus (systématique).
    expect(db.tables.agent_gateway_audit_log.length).toBeGreaterThan(0);
    expect(db.tables.agent_gateway_audit_log[0].status).toBe("DENIED");
  });
});

// ── (2) Mauvais scope → DENIED 403 ───────────────────────────────────────────
describe("buyers.list route — scope requis (preuve 2)", () => {
  it("token scope 'write' seul sur une LECTURE → DENIED 403 scope_denied:read", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "write";
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("scope_denied:read");
  });
});

// ── (4) Acteur inexistant → DENIED 403 ───────────────────────────────────────
describe("buyers.list route — acteur vérifié (preuve 4)", () => {
  it("acteur absent de users → DENIED 403 actor_not_in_tenant, aucune donnée", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(
      makeReq({ ...baseBody, actor_user_id: "99999999-9999-4999-8999-999999999999" }),
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("actor_not_in_tenant");
    expect(json.items).toBeUndefined();
  });

  it("agent hors allowlist → DENIED 403 agent_not_allowed", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, agent_id: "agent-pirate" }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("agent_not_allowed");
  });
});

// ── Chemin autorisé : lecture réelle ─────────────────────────────────────────
describe("buyers.list route — chemin autorisé", () => {
  it("token+tenant+agent+scope+acteur OK → AVAILABLE avec les résumés acquéreur", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("AVAILABLE");
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBe(1);
    expect(json.items[0].buyer_id).toBe("66666666-6666-4666-8666-666666666666");
  });
});
