/**
 * lib/invest/shared/dlq-drain.test.ts
 *
 * Tests unitaires de drainFailedOperations.
 * Fakes in-memory, pas de vi.mock global, tenant "real-estate-agent".
 */

import { describe, it, expect } from "vitest";
import { drainFailedOperations } from "./dlq-drain";
import type { DlqDrainStore, FailedOpRow } from "./dlq-drain";
import type { EscrowPort } from "../ports/escrow";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT = "real-estate-agent";

function makeRow(overrides: Partial<FailedOpRow> = {}): FailedOpRow {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    deal_id: crypto.randomUUID(),
    subscription_id: crypto.randomUUID(),
    op_kind: "refund",
    payload: { idempotencyKey: `refund:sub-${Math.random()}`, amountEur: 1000 },
    attempts: 1,
    last_error: null,
    status: "open",
    ...overrides,
  };
}

/** Store in-memory. Suit le cycle open → resolved/retrying/abandoned. */
function makeStore(initialRows: FailedOpRow[]): DlqDrainStore & { rows: FailedOpRow[] } {
  const rows: FailedOpRow[] = initialRows.map((r) => ({ ...r }));
  return {
    rows,
    async listOpen(_tid, limit) {
      return rows.filter((r) => r.status === "open").slice(0, limit);
    },
    async markResolved(id) {
      const r = rows.find((x) => x.id === id);
      if (r) r.status = "resolved";
    },
    async markRetry(id, attempts, lastError) {
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = "retrying";
        r.attempts = attempts;
        r.last_error = lastError;
      }
    },
    async markAbandoned(id, lastError) {
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = "abandoned";
        r.last_error = lastError;
      }
    },
  };
}

/** Escrow qui réussit toujours. */
function makeEscrowOk(): EscrowPort {
  return {
    isConfigured: () => true,
    createDepositInstruction: async () => ({ providerRef: "ok", instructions: {} }),
    release: async () => ({ providerRef: "ok" }),
    refund: async () => ({ providerRef: "ok" }),
    verifyWebhook: () => true,
  };
}

/** Escrow qui échoue toujours sur refund. */
function makeEscrowFail(message = "provider_error"): EscrowPort {
  return {
    isConfigured: () => true,
    createDepositInstruction: async () => ({ providerRef: "ok", instructions: {} }),
    release: async () => ({ providerRef: "ok" }),
    refund: async () => {
      throw new Error(message);
    },
    verifyWebhook: () => true,
  };
}

/** Escrow non configuré. */
function makeEscrowOff(): EscrowPort {
  return {
    isConfigured: () => false,
    createDepositInstruction: async () => ({ providerRef: "", instructions: {} }),
    release: async () => ({ providerRef: "" }),
    refund: async () => ({ providerRef: "" }),
    verifyWebhook: () => false,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("drainFailedOperations", () => {
  it("3 refunds open + escrowOk → resolved:3", async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    const store = makeStore(rows);
    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowOk(),
      tenantId: TENANT,
    });

    expect(result.resolved).toBe(3);
    expect(result.retrying).toBe(0);
    expect(result.abandoned).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.scanned).toBe(3);

    // Toutes les lignes sont passées resolved en store.
    expect(store.rows.every((r) => r.status === "resolved")).toBe(true);
  });

  it("escrowFail + attempts < maxAttempts → retrying (attempts++)", async () => {
    const row = makeRow({ attempts: 2 });
    const store = makeStore([row]);
    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowFail("stripe_timeout"),
      tenantId: TENANT,
      maxAttempts: 5,
    });

    expect(result.retrying).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.abandoned).toBe(0);

    const updated = store.rows[0];
    expect(updated.status).toBe("retrying");
    expect(updated.attempts).toBe(3); // 2+1
    expect(updated.last_error).toBe("stripe_timeout");
  });

  it("attempts=max-1 + escrowFail → abandoned", async () => {
    // maxAttempts=5, attempts=4 → après +1 on atteint exactement 5 → abandoned.
    const row = makeRow({ attempts: 4 });
    const store = makeStore([row]);
    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowFail("final_error"),
      tenantId: TENANT,
      maxAttempts: 5,
    });

    expect(result.abandoned).toBe(1);
    expect(result.retrying).toBe(0);
    expect(store.rows[0].status).toBe("abandoned");
    expect(store.rows[0].last_error).toBe("final_error");
  });

  it("escrowOff → tout skipped", async () => {
    const rows = [makeRow(), makeRow()];
    const store = makeStore(rows);
    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowOff(),
      tenantId: TENANT,
    });

    expect(result.skipped).toBe(2);
    expect(result.resolved).toBe(0);
    // Les lignes restent open (escrow off = aucune modif).
    expect(store.rows.every((r) => r.status === "open")).toBe(true);
  });

  it("op_kind='mint' → skipped (laissé open)", async () => {
    const row = makeRow({ op_kind: "mint" });
    const store = makeStore([row]);
    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowOk(),
      tenantId: TENANT,
    });

    expect(result.skipped).toBe(1);
    expect(result.resolved).toBe(0);
    expect(store.rows[0].status).toBe("open");
  });

  it("fail-soft : markResolved throw sur 1ère ligne → ligne reste open, resolved=1 (pas 2)", async () => {
    const rowBad = makeRow();
    const rowGood = makeRow();

    // Store qui throw sur la première ligne lors de markResolved, mais pas la 2e.
    let resolveCallCount = 0;
    const store = makeStore([rowBad, rowGood]);
    const originalMarkResolved = store.markResolved.bind(store);
    store.markResolved = async (id) => {
      resolveCallCount += 1;
      if (resolveCallCount === 1) {
        throw new Error("db_timeout");
      }
      return originalMarkResolved(id);
    };

    const result = await drainFailedOperations({
      store,
      escrow: makeEscrowOk(),
      tenantId: TENANT,
    });

    // FIX-3 : markResolved a throw sur la 1ère ligne → elle reste open, n'est PAS comptée.
    // Seule la 2e ligne est comptée resolved.
    expect(result.resolved).toBe(1);
    expect(result.scanned).toBe(2);

    // La première ligne doit rester open (markResolved a échoué).
    const bad = store.rows.find((r) => r.id === rowBad.id)!;
    expect(bad.status).toBe("open");

    // La deuxième ligne est bien resolved.
    const good = store.rows.find((r) => r.id === rowGood.id)!;
    expect(good.status).toBe("resolved");
  });

  it("FIX-1 : refund sans amountEur valide → abandoned missing_amount, escrow.refund jamais appelé", async () => {
    let refundCalled = false;
    const escrow: EscrowPort = {
      isConfigured: () => true,
      createDepositInstruction: async () => ({ providerRef: "ok", instructions: {} }),
      release: async () => ({ providerRef: "ok" }),
      refund: async () => {
        refundCalled = true;
        return { providerRef: "ok" };
      },
      verifyWebhook: () => true,
    };

    // Cas amountEur absent
    const rowMissing = makeRow({ payload: { idempotencyKey: "refund:sub-1" } });
    // Cas amountEur = 0
    const rowZero = makeRow({ payload: { idempotencyKey: "refund:sub-2", amountEur: 0 } });
    // Cas amountEur négatif
    const rowNeg = makeRow({ payload: { idempotencyKey: "refund:sub-3", amountEur: -50 } });
    // Cas amountEur = NaN (typeof NaN === "number" mais !Number.isFinite → abandoned)
    const rowNaN = makeRow({ payload: { idempotencyKey: "refund:sub-4", amountEur: NaN } });
    // Cas amountEur = Infinity (couvert par isFinite)
    const rowInf = makeRow({ payload: { idempotencyKey: "refund:sub-5", amountEur: Infinity } });

    const store = makeStore([rowMissing, rowZero, rowNeg, rowNaN, rowInf]);
    const result = await drainFailedOperations({ store, escrow, tenantId: TENANT });

    expect(refundCalled).toBe(false);
    expect(result.abandoned).toBe(5);
    expect(result.resolved).toBe(0);

    for (const row of store.rows) {
      expect(row.status).toBe("abandoned");
      expect(row.last_error).toBe("missing_amount");
    }
  });

  it("FIX-1 : refund sans idempotencyKey → abandoned missing_idempotency_key, escrow.refund jamais appelé", async () => {
    let refundCalled = false;
    const escrow: EscrowPort = {
      isConfigured: () => true,
      createDepositInstruction: async () => ({ providerRef: "ok", instructions: {} }),
      release: async () => ({ providerRef: "ok" }),
      refund: async () => {
        refundCalled = true;
        return { providerRef: "ok" };
      },
      verifyWebhook: () => true,
    };

    // Cas idempotencyKey absent
    const rowNoKey = makeRow({ payload: { amountEur: 500 } });
    // Cas idempotencyKey vide
    const rowEmptyKey = makeRow({ payload: { idempotencyKey: "   ", amountEur: 500 } });
    // Cas idempotencyKey non-string
    const rowBadKey = makeRow({ payload: { idempotencyKey: 42, amountEur: 500 } });

    const store = makeStore([rowNoKey, rowEmptyKey, rowBadKey]);
    const result = await drainFailedOperations({ store, escrow, tenantId: TENANT });

    expect(refundCalled).toBe(false);
    expect(result.abandoned).toBe(3);
    expect(result.resolved).toBe(0);

    for (const row of store.rows) {
      expect(row.status).toBe("abandoned");
      expect(row.last_error).toBe("missing_idempotency_key");
    }
  });
});
