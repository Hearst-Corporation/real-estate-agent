/**
 * Tests du budget-temps de defineGatewayRoute (REA-M04-02).
 *
 * Renforcement : le timer de course (withTimeout) est TOUJOURS libéré une fois la
 * course tranchée. Sans clearTimeout, un handler rapide laisserait un setTimeout
 * pendant — timer fuité par appel, event loop gardé éveillé.
 *
 * Preuves couvertes :
 *   (T1) handler RAPIDE (gagne la course) → AVAILABLE ET aucun timer résiduel
 *        (vi.getTimerCount() === 0) : le timeout a bien été nettoyé.
 *   (T2) handler LENT (dépasse le budget) → TIMEOUT 504, pas de retry, ET aucun
 *        timer résiduel après résolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { FakeDb } from "./test-helpers";

const getAdmin = vi.fn();
vi.mock("@/lib/gpu1", async (importActual) => ({ ...(await importActual<object>()), getGpu1Admin: () => getAdmin() }));

import { defineGatewayRoute } from "./handler";
import { GatewayEnvelopeSchema } from "./contracts";

const TOKEN = "gateway-secret-token";
const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";

function seedDb(): FakeDb {
  return new FakeDb({
    users: [{ id: ACTOR, tenant_id: TENANT, email: "a@demo-agent.local" }],
    agent_gateway_audit_log: [],
  });
}

function makeReq(body: unknown): Request {
  return new Request("http://x/api/agent-gateway/v1/test/iface", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
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
  // Interface inconnue de la table de scopes → traitée comme `write` : on accorde write.
  process.env.AGENT_GATEWAY_SCOPES = "read,write";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("defineGatewayRoute — timer libéré (preuve T1 : handler rapide)", () => {
  it("handler rapide → AVAILABLE et AUCUN timer résiduel après la course", async () => {
    getAdmin.mockReturnValue(seedDb());
    const POST = defineGatewayRoute({
      interfaceName: "test.fast",
      schema: GatewayEnvelopeSchema.strict(),
      timeoutMs: 30_000, // budget large : le handler gagne largement la course
      handler: async () => ({ status: "AVAILABLE" as const, data: { ok: true } }),
    });

    vi.useFakeTimers();
    try {
      const res = await POST(makeReq(baseBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.status).toBe("AVAILABLE");
      // Le setTimeout du budget a été nettoyé (clearTimeout) : rien ne pend.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("defineGatewayRoute — timeout (preuve T2 : handler lent)", () => {
  it("handler dépassant le budget → TIMEOUT 504, pas de retry, aucun timer résiduel", async () => {
    getAdmin.mockReturnValue(seedDb());
    let calls = 0;
    const POST = defineGatewayRoute({
      interfaceName: "test.slow",
      schema: GatewayEnvelopeSchema.extend({ n: z.number().optional() }).strict(),
      timeoutMs: 5_000,
      handler: async () => {
        calls += 1;
        // Ne résout jamais → le budget doit trancher en TIMEOUT.
        return new Promise<never>(() => {});
      },
    });

    vi.useFakeTimers();
    try {
      const p = POST(makeReq(baseBody));
      await vi.advanceTimersByTimeAsync(5_001);
      const res = await p;
      const json = await res.json();
      expect(res.status).toBe(504);
      expect(json.status).toBe("TIMEOUT");
      expect(calls).toBe(1); // le handler n'est PAS relancé (pas de retry silencieux)
      // La course tranchée, le timer est nettoyé.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
