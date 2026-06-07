/**
 * lib/invest/tokenization/mint-reconcile.test.ts — ⑥ mintMirror + reconcile (store mémoire).
 *
 * Vérifie : mint fail-soft (port absent ⇒ pending, JAMAIS d'échec) + transition
 * allocated→minted (décision testnet), et réconciliation DEEP-gagne :
 *   - aucune donnée chaîne ⇒ legal_only (in_sync, pas de pause) ;
 *   - chaîne == DEEP ⇒ in_sync ; chaîne < DEEP ⇒ mint_missing ; chaîne > DEEP ⇒ pause.
 */

import { describe, it, expect } from "vitest";
import { mintMirror, reconcile, type TokenizationStore } from "./index";
import type { TokenizationPort } from "../ports/tokenization";
import type { ChainPort } from "../ports/chain";
import type { IdempotencyStore } from "../shared/idempotency";
import { ProviderUnavailableError } from "../shared/errors";

const TENANT = "real-estate-agent";
const DEAL = "deal-1";

/** Idempotency store mémoire (toujours neuf → fn exécutée). */
function memIdem(): IdempotencyStore {
  const seen = new Map<string, unknown>();
  return {
    async find(key) {
      return seen.has(key) ? { idem_key: key, body_hash: "h", response: seen.get(key) } : null;
    },
    async insert(key, _h, resp) {
      if (resp === null) {
        if (seen.has(key)) return false;
        seen.set(key, null);
        return true;
      }
      seen.set(key, resp);
      return true;
    },
  };
}

function memTokStore(opts: {
  allocated?: { id: string; user: string; units: number }[];
  contract?: string | null;
  deep?: { holderKey: string; units: number }[];
  chain?: { holderKey: string; units: number }[];
}): { store: TokenizationStore; minted: string[]; mints: { status: string }[]; runs: unknown[] } {
  const minted: string[] = [];
  const mints: { status: string }[] = [];
  const runs: unknown[] = [];
  let mintDone = false;
  const store: TokenizationStore = {
    async listAllocatedSubscriptions() {
      if (mintDone) return [];
      mintDone = true;
      return (opts.allocated ?? []).map((a) => ({
        id: a.id,
        tenant_id: TENANT,
        user_id: a.user,
        investor_profile_id: `prof:${a.user}`,
        deal_id: DEAL,
        bond_tranche_id: "tr1",
        units: a.units,
        status: "allocated",
      }));
    },
    async findTrancheChainInfo() {
      return {
        id: "tr1",
        tenant_id: TENANT,
        chain: "permissioned",
        token_contract_address: opts.contract ?? null,
        token_standard: "ERC-3643",
      };
    },
    async insertTokenMint(_t, row) {
      mints.push({ status: row.status });
      return { id: `mint:${mints.length}` };
    },
    async markSubscriptionMinted(_t, id) {
      minted.push(id);
    },
    async deepHoldings() {
      return opts.deep ?? [];
    },
    async chainHoldings() {
      return opts.chain ?? [];
    },
    async insertReconciliationRun(_t, row) {
      runs.push(row);
      return { id: `run:${runs.length}` };
    },
  };
  return { store, minted, mints, runs };
}

const PORT_CONFIGURED: TokenizationPort = {
  isConfigured: () => true,
  async mint() {
    return { txHash: "0x" + "a".repeat(64), status: "confirmed" };
  },
  async burn() {
    return { txHash: "0x" + "b".repeat(64), status: "confirmed" };
  },
  async forcedTransfer() {
    return { txHash: "0x" + "c".repeat(64), status: "confirmed" };
  },
  async pause() {
    return { txHash: "0x" + "d".repeat(64), status: "confirmed" };
  },
  async canTransfer() {
    return true;
  },
  async isVerified() {
    return true;
  },
  async inscribeDeep() {
    return { deepRef: "deep-x" };
  },
};

const PORT_ABSENT: TokenizationPort = {
  isConfigured: () => false,
  async mint() {
    throw new ProviderUnavailableError("tokeny");
  },
  async burn() {
    throw new ProviderUnavailableError("tokeny");
  },
  async forcedTransfer() {
    throw new ProviderUnavailableError("tokeny");
  },
  async pause() {
    throw new ProviderUnavailableError("tokeny");
  },
  async canTransfer() {
    return false;
  },
  async isVerified() {
    return false;
  },
  async inscribeDeep() {
    throw new ProviderUnavailableError("tokeny");
  },
};

const CHAIN_ABSENT: ChainPort = {
  isConfigured: () => false,
  async getConfirmations() {
    return 0;
  },
  async getTokenBalance() {
    return 0;
  },
  async getEvents() {
    return [];
  },
  verifyWebhook() {
    return false;
  },
};

const CHAIN_PRESENT: ChainPort = { ...CHAIN_ABSENT, isConfigured: () => true };

describe("mintMirror — fail-soft (port Tokeny absent)", () => {
  it("port absent → mint pending, AUCUN échec, allocated→minted (décision testnet)", async () => {
    const { store, minted, mints } = memTokStore({ allocated: [{ id: "s1", user: "u1", units: 10 }] });
    const res = await mintMirror(store, DEAL, { port: PORT_ABSENT, idempotency: memIdem(), tenantId: TENANT });
    expect(res.failSoft).toBe(true);
    expect(res.pending).toBe(1);
    expect(res.minted).toBe(0);
    expect(mints[0].status).toBe("pending");
    expect(minted).toContain("s1"); // marqué minted malgré pending (DEEP fait foi)
  });

  it("port configuré + contrat présent → mint confirmé", async () => {
    const { store, minted, mints } = memTokStore({
      allocated: [{ id: "s1", user: "u1", units: 10 }],
      contract: "0x" + "1".repeat(40),
    });
    const res = await mintMirror(store, DEAL, { port: PORT_CONFIGURED, idempotency: memIdem(), tenantId: TENANT });
    expect(res.failSoft).toBe(false);
    expect(res.minted).toBe(1);
    expect(mints[0].status).toBe("confirmed");
    expect(minted).toContain("s1");
  });
});

describe("reconcile — DEEP gagne", () => {
  it("indexer absent → legal_only (in_sync, pas de pause)", async () => {
    const { store, runs } = memTokStore({ deep: [{ holderKey: "u1", units: 10 }] });
    const res = await reconcile(store, DEAL, { chain: CHAIN_ABSENT, tenantId: TENANT });
    expect(res.outcome).toBe("legal_only");
    expect(res.pause).toBe(false);
    expect(runs).toHaveLength(1);
  });

  it("chaîne == DEEP → in_sync", async () => {
    const { store } = memTokStore({
      deep: [{ holderKey: "u1", units: 10 }],
      chain: [{ holderKey: "u1", units: 10 }],
    });
    const res = await reconcile(store, DEAL, { chain: CHAIN_PRESENT, tenantId: TENANT });
    expect(res.outcome).toBe("in_sync");
    expect(res.pause).toBe(false);
  });

  it("chaîne < DEEP → mint_missing (pas de pause)", async () => {
    const { store } = memTokStore({
      deep: [{ holderKey: "u1", units: 10 }],
      chain: [{ holderKey: "u1", units: 7 }],
    });
    const res = await reconcile(store, DEAL, { chain: CHAIN_PRESENT, tenantId: TENANT });
    expect(res.outcome).toBe("mint_missing");
    expect(res.pause).toBe(false);
  });

  it("chaîne > DEEP → chain_exceeds_deep + PAUSE (DEEP prime)", async () => {
    const { store, runs } = memTokStore({
      deep: [{ holderKey: "u1", units: 10 }],
      chain: [{ holderKey: "u1", units: 12 }],
    });
    const res = await reconcile(store, DEAL, { chain: CHAIN_PRESENT, tenantId: TENANT });
    expect(res.outcome).toBe("chain_exceeds_deep");
    expect(res.pause).toBe(true);
    expect((runs[0] as { triggered_pause: boolean }).triggered_pause).toBe(true);
  });

  it("holder présent on-chain mais absent du DEEP → anomalie (pause)", async () => {
    const { store } = memTokStore({
      deep: [{ holderKey: "u1", units: 10 }],
      chain: [
        { holderKey: "u1", units: 10 },
        { holderKey: "ghost", units: 3 },
      ],
    });
    const res = await reconcile(store, DEAL, { chain: CHAIN_PRESENT, tenantId: TENANT });
    expect(res.pause).toBe(true);
    expect(res.outcome).toBe("chain_exceeds_deep");
  });
});
