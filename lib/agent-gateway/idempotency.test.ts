/**
 * Tests de l'idempotence gateway avec détection de CONFLIT payload (durcissement A2).
 *
 * Preuve couverte : (7) même Idempotency-Key + payload DIFFÉRENT → DENIED
 * (idempotency_key_conflict), pas un rejeu silencieux. + rejeu même payload →
 * réponse mémorisée (aucun second effet).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "./test-helpers";

// Mock du client admin AVANT l'import des modules testés (hoisting vi.mock).
const getAdmin = vi.fn();
vi.mock("@/lib/gpu1", async (importActual) => ({ ...(await importActual<object>()), getGpu1Admin: () => getAdmin() }));

import { runIdempotentWrite } from "./idempotent-write";
import type { GatewayHandlerResult } from "./handler";

const TENANT = "real-estate-agent";
const IFACE = "crm.create_lead";
const KEY = "idem-key-abcdef123456";

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  getAdmin.mockReturnValue(db);
});

describe("runIdempotentWrite — conflit payload-hash (preuve 7)", () => {
  it("1er appel écrit ; rejeu MÊME clé + payload DIFFÉRENT → DENIED, écriture NON rejouée", async () => {
    let writeCount = 0;
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => {
      writeCount += 1;
      return { status: "AVAILABLE", data: { lead_id: `lead-${writeCount}` } };
    };

    const first = await runIdempotentWrite(TENANT, IFACE, KEY, { full_name: "Alice" }, write);
    expect(first.status).toBe("AVAILABLE");
    expect(writeCount).toBe(1);

    // Même clé, payload différent → conflit.
    const conflict = await runIdempotentWrite(TENANT, IFACE, KEY, { full_name: "Bob" }, write);
    expect(conflict.status).toBe("DENIED");
    expect(conflict.reason).toBe("idempotency_key_conflict");
    // L'écriture n'a PAS été rejouée.
    expect(writeCount).toBe(1);
  });

  it("rejeu MÊME clé + MÊME payload → réponse mémorisée, aucun second effet", async () => {
    let writeCount = 0;
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => {
      writeCount += 1;
      return { status: "AVAILABLE", data: { lead_id: `lead-${writeCount}` } };
    };

    const payload = { full_name: "Alice" };
    const first = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    const replay = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);

    expect(writeCount).toBe(1); // pas de second write
    expect(replay.status).toBe("AVAILABLE");
    expect(replay).toEqual(first); // réponse identique mémorisée
  });

  it("clés différentes → deux écritures indépendantes", async () => {
    let writeCount = 0;
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => {
      writeCount += 1;
      return { status: "AVAILABLE", data: { lead_id: `lead-${writeCount}` } };
    };
    await runIdempotentWrite(TENANT, IFACE, "key-one-aaaaaa", { full_name: "A" }, write);
    await runIdempotentWrite(TENANT, IFACE, "key-two-bbbbbb", { full_name: "B" }, write);
    expect(writeCount).toBe(2);
  });
});
