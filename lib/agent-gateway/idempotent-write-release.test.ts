/**
 * Tests du scellement SÉLECTIF de la clé d'idempotence (REA-M04-02).
 *
 * Invariant renforcé : seul un résultat AVAILABLE (effet réel) scelle la clé
 * `completed` ; un échec (UNAVAILABLE/DENIED/TIMEOUT) RELÂCHE la réservation pour
 * qu'un rejeu LÉGITIME de la même clé puisse réessayer. La garantie "aucun second
 * effet" reste intacte : le succès, lui, n'est JAMAIS rejoué (un seul write).
 *
 * Preuves couvertes :
 *   (A) succès → rejeu même clé/payload ne double pas l'effet (1 seul write) — la
 *       clé est scellée, réponse mémorisée renvoyée.
 *   (B) échec transitoire (UNAVAILABLE) → la clé est relâchée → un rejeu RÉEXÉCUTE
 *       le write (ré-essai possible), et un succès au 2e essai n'est pas bloqué.
 *   (C) DENIED → relâché de même (aucun effet produit → réessai permis).
 *   (D) la ligne `running` disparaît réellement de la table après un échec
 *       (release = delete conditionnel status='running').
 *   (E) un succès NE relâche PAS (la ligne reste `completed`, le rejeu ne réécrit pas).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "./test-helpers";

// Mock du client admin AVANT l'import des modules testés (hoisting vi.mock).
const getAdmin = vi.fn();
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getAdmin() }));

import { runIdempotentWrite } from "./idempotent-write";
import type { GatewayHandlerResult } from "./handler";

const TENANT = "real-estate-agent";
const IFACE = "crm.create_lead";
const KEY = "idem-key-release-001";

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb({ agent_gateway_idempotency_keys: [] });
  getAdmin.mockReturnValue(db);
});

describe("runIdempotentWrite — scellement sélectif (preuve A : succès scellé)", () => {
  it("succès puis rejeu même clé/payload → 1 SEUL write, réponse mémorisée", async () => {
    let writeCount = 0;
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => {
      writeCount += 1;
      return { status: "AVAILABLE", data: { lead_id: `lead-${writeCount}` } };
    };
    const payload = { full_name: "Alice" };

    const first = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    const replay = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);

    expect(first.status).toBe("AVAILABLE");
    expect(writeCount).toBe(1); // pas de second effet
    expect(replay).toEqual(first); // réponse mémorisée
  });
});

describe("runIdempotentWrite — release sur échec (preuves B, C, D)", () => {
  it("échec transitoire UNAVAILABLE → clé relâchée → rejeu RÉEXÉCUTE (réessai possible)", async () => {
    let attempt = 0;
    // 1er essai échoue (transitoire), 2e essai réussit.
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => {
      attempt += 1;
      if (attempt === 1) return { status: "UNAVAILABLE", reason: "insert_failed" };
      return { status: "AVAILABLE", data: { lead_id: "lead-ok" } };
    };
    const payload = { full_name: "Bob" };

    const first = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    expect(first.status).toBe("UNAVAILABLE");
    expect(first.reason).toBe("insert_failed");

    // Rejeu même clé : la réservation ayant été relâchée, le write est RÉEXÉCUTÉ
    // (pas d'échec mémorisé figé) et réussit cette fois.
    const retry = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    expect(retry.status).toBe("AVAILABLE");
    if (retry.status === "AVAILABLE") expect(retry.data?.lead_id).toBe("lead-ok");
    expect(attempt).toBe(2); // le write a bien tourné deux fois
  });

  it("DENIED (aucun effet) → clé relâchée → rejeu réexécute", async () => {
    let attempt = 0;
    const write = async (): Promise<GatewayHandlerResult> => {
      attempt += 1;
      return { status: "DENIED", reason: "match_not_found" };
    };
    const payload = { match_id: "x" };

    const first = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    const retry = await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);

    expect(first.status).toBe("DENIED");
    expect(retry.status).toBe("DENIED");
    // Réexécuté : la clé n'a jamais figé le DENIED (aucun effet à protéger).
    expect(attempt).toBe(2);
  });

  it("après un échec, la ligne 'running' DISPARAÎT de la table (delete conditionnel)", async () => {
    const write = async (): Promise<GatewayHandlerResult> => ({
      status: "UNAVAILABLE",
      reason: "send_failed",
    });
    await runIdempotentWrite(TENANT, IFACE, KEY, { a: 1 }, write);
    // Aucune ligne résiduelle : le release a supprimé la réservation.
    expect(db.tables.agent_gateway_idempotency_keys).toHaveLength(0);
  });
});

describe("runIdempotentWrite — le succès n'est PAS relâché (preuve E)", () => {
  it("succès → la ligne reste 'completed' avec la réponse mémorisée", async () => {
    const write = async (): Promise<GatewayHandlerResult<{ lead_id: string }>> => ({
      status: "AVAILABLE",
      data: { lead_id: "lead-42" },
    });
    await runIdempotentWrite(TENANT, IFACE, KEY, { a: 1 }, write);

    const rows = db.tables.agent_gateway_idempotency_keys;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    // La réponse mémorisée est bien celle du succès.
    const memo = rows[0].response as GatewayHandlerResult<{ lead_id: string }>;
    expect(memo.status).toBe("AVAILABLE");
    expect(memo.data?.lead_id).toBe("lead-42");
  });

  it("succès → aucune écriture supplémentaire au rejeu (1 seul insert de clé)", async () => {
    let writeCount = 0;
    const write = async (): Promise<GatewayHandlerResult<{ id: string }>> => {
      writeCount += 1;
      return { status: "AVAILABLE", data: { id: `x-${writeCount}` } };
    };
    const payload = { v: 1 };
    await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    await runIdempotentWrite(TENANT, IFACE, KEY, payload, write);
    // Une seule ligne de clé, un seul effet.
    expect(db.tables.agent_gateway_idempotency_keys).toHaveLength(1);
    expect(writeCount).toBe(1);
  });
});
