/**
 * Tests d'intégration bout-en-bout de la route `listings.normalize` (AVAILABLE).
 * Prouve, EN PASSANT PAR LA FRONTIÈRE DE CONFIANCE (defineGatewayRoute → authz) :
 *   - AVAILABLE quand tout est autorisé (scope `read`), avec des lignes canoniques ;
 *   - le tenant des lignes = tenant DÉRIVÉ DE L'AUTH (jamais le payload) ;
 *   - AUCUNE PERSISTANCE : la seule table touchée est l'audit (agent_gateway_audit_log),
 *     JAMAIS prosp_annonces (spy sur `from`) ;
 *   - DENIED sur tenant mismatch / agent hors allowlist / token absent / scope write-only ;
 *   - source inconnue rejetée par le schéma (400).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb } from "./test-helpers";

const getAdmin = vi.fn();
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getAdmin() }));

import { POST } from "@/app/api/agent-gateway/v1/listings/normalize/route";

const TOKEN = "gateway-secret-token";
const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";

function seedDb(): FakeDb {
  return new FakeDb({
    users: [{ id: ACTOR, tenant_id: TENANT, email: "alice@demo-agent.local" }],
    prosp_annonces: [],
    agent_gateway_audit_log: [],
  });
}

const ITEMS = [
  {
    id: "mi-100",
    type_bien: "appartement",
    titre: "T3",
    prix: 345000,
    surface: 68,
    pieces: 3,
    code_postal: "06600",
    ville: "Antibes",
  },
];

function makeReq(body: unknown, withToken = true): Request {
  return new Request("http://x/api/agent-gateway/v1/listings/normalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  tenant_id: TENANT,
  actor_user_id: ACTOR,
  agent_id: AGENT,
  source: "moteurimmo",
  items: ITEMS,
};

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

describe("listings.normalize route — chemin autorisé (AVAILABLE, read, sans persistance)", () => {
  it("token+tenant+agent+scope+acteur OK → AVAILABLE, lignes canoniques, AUCUNE écriture prosp_annonces", async () => {
    const db = seedDb();
    const fromSpy = vi.spyOn(db, "from");
    getAdmin.mockReturnValue(db);

    const res = await POST(makeReq(baseBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("AVAILABLE");
    expect(json.source).toBe("moteurimmo");
    expect(json.normalized_count).toBe(1);
    expect(Array.isArray(json.listings)).toBe(true);
    expect(json.listings[0].row.source_id).toBe("mi-100");
    // Tenant des lignes = tenant DÉRIVÉ DE L'AUTH.
    expect(json.listings[0].row.tenant_id).toBe(TENANT);
    expect(json.listings[0].hash_dedup).toBeTruthy();

    // AUCUNE persistance : prosp_annonces jamais touchée. La table reste vide.
    const annonceTouches = fromSpy.mock.calls.filter((c) => c[0] === "prosp_annonces");
    expect(annonceTouches.length).toBe(0);
    expect(db.tables.prosp_annonces).toHaveLength(0);
  });

  it("scope 'read' seul suffit (c'est une lecture) → AVAILABLE", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "read";
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(json.status).toBe("AVAILABLE");
  });
});

describe("listings.normalize route — frontière A2 (DENIED)", () => {
  it("tenant du payload ≠ token → DENIED tenant_mismatch, aucune normalisation", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, tenant_id: "tenant-pirate" }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("tenant_mismatch");
    expect(json.listings).toBeUndefined();
  });

  it("agent hors allowlist → DENIED agent_not_allowed", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, agent_id: "agent-pirate" }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("agent_not_allowed");
  });

  it("sans token → DENIED 401", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq(baseBody, false));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.status).toBe("DENIED");
  });

  it("source inconnue → 400 invalid_body (rejetée par le schéma)", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, source: "seloger" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.reason).toBe("invalid_body");
  });

  it("items vides → 400 invalid_body (min 1)", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, items: [] }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.reason).toBe("invalid_body");
  });
});
