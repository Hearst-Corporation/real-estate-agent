/**
 * lib/invest/ledger/inscribe.test.ts — ④ inscribeDeep DB-backed (store mémoire).
 *
 * Vérifie : inscription des `funded`, chaînage de hash applicatif (I10) cohérent et
 * vérifiable, transition funded→allocated (machine pure), idempotence (2ᵉ appel ⇒
 * rien de neuf), getHoldings/getEntries.
 */

import { describe, it, expect } from "vitest";
import {
  inscribeDeep,
  getHoldings,
  getEntries,
  verifyHashChain,
  computeEntryHash,
  type LedgerStore,
  type CapTableRow,
  type FundedSubscriptionRow,
} from "./index";

const TENANT = "real-estate-agent";
const DEAL = "deal-1";

function funded(id: string, user: string, units: number, amount: number): FundedSubscriptionRow {
  return {
    id,
    tenant_id: TENANT,
    user_id: user,
    investor_profile_id: `prof:${user}`,
    deal_id: DEAL,
    bond_tranche_id: "tr1",
    units,
    amount_eur: amount,
    status: "funded",
  };
}

/** Store mémoire : table cap_table en RAM + souscriptions qui passent allocated. */
function memStore(initialFunded: FundedSubscriptionRow[]): {
  store: LedgerStore;
  rows: CapTableRow[];
  allocated: string[];
} {
  const rows: CapTableRow[] = [];
  const allocated: string[] = [];
  const pool = [...initialFunded];
  const store: LedgerStore = {
    async listFundedSubscriptions() {
      // Les déjà-alloués ne sont plus `funded` (idempotence).
      return pool.filter((s) => !allocated.includes(s.id));
    },
    async lastEntryForDeal() {
      return rows.length ? rows[rows.length - 1] : null;
    },
    async currentBalanceUnits(_t, _tr, holder) {
      const mine = rows.filter((r) => r.holder_user_id === holder);
      return mine.length ? Number(mine[mine.length - 1].balance_units_after) : 0;
    },
    async insertCapTableEntry(_t, row) {
      const created: CapTableRow = {
        id: `cap:${rows.length + 1}`,
        tenant_id: TENANT,
        deal_id: row.deal_id,
        bond_tranche_id: row.bond_tranche_id,
        subscription_id: row.subscription_id,
        holder_profile_id: row.holder_profile_id,
        holder_user_id: row.holder_user_id,
        entry_type: row.entry_type,
        units: row.units,
        nominal_eur: row.nominal_eur,
        balance_units_after: row.balance_units_after,
        deep_register_ref: row.deep_register_ref,
        reconciliation_status: row.reconciliation_status,
        notes: row.notes,
        created_at: new Date(Date.now() + rows.length).toISOString(),
      };
      rows.push(created);
      return created;
    },
    async upsertBondRegister(_t, row) {
      return { id: `reg:${row.subscription_id}` };
    },
    async insertDeepInscription() {
      return { id: "deep1" };
    },
    async markSubscriptionAllocated(_t, id) {
      allocated.push(id);
    },
    async listEntries() {
      return [...rows];
    },
  };
  return { store, rows, allocated };
}

describe("inscribeDeep — inscription DEEP + chaînage I10", () => {
  it("inscrit toutes les funded, chaîne les hash, passe funded→allocated", async () => {
    const { store, rows, allocated } = memStore([funded("s1", "u1", 10, 1000), funded("s2", "u2", 5, 500)]);
    const res = await inscribeDeep(store, DEAL, { tenantId: TENANT });

    expect(res.inscribed).toBe(2);
    expect(res.fundedSeen).toBe(2);
    expect(allocated).toEqual(["s1", "s2"]);
    expect(rows).toHaveLength(2);

    // Chaîne intacte : entries lues → verifyHashChain true.
    const entries = await getEntries(store, DEAL, TENANT);
    expect(verifyHashChain(entries)).toBe(true);
    // genesis prev=null, 2ᵉ maillon prev = hash du 1er.
    expect(entries[0].prevHash).toBeNull();
    expect(entries[1].prevHash).toBe(entries[0].entryHash);
  });

  it("hash recalculable (déterministe) sur le payload canonique", async () => {
    const { store, rows } = memStore([funded("s1", "u1", 10, 1000)]);
    await inscribeDeep(store, DEAL, { tenantId: TENANT });
    const r = rows[0];
    const recomputed = computeEntryHash({
      prevHash: null,
      dealId: DEAL,
      subscriptionId: "s1",
      entryType: "issuance",
      units: 10,
      balanceUnitsAfter: 10,
      deepRegisterRef: r.deep_register_ref,
    });
    const stored = JSON.parse(r.notes ?? "{}") as { entry_hash?: string };
    expect(stored.entry_hash).toBe(recomputed);
  });

  it("idempotent : 2ᵉ appel n'inscrit rien (toutes déjà allocated)", async () => {
    const { store } = memStore([funded("s1", "u1", 10, 1000)]);
    await inscribeDeep(store, DEAL, { tenantId: TENANT });
    const second = await inscribeDeep(store, DEAL, { tenantId: TENANT });
    expect(second.inscribed).toBe(0);
    expect(second.fundedSeen).toBe(0);
  });

  it("getHoldings agrège la dernière balance par porteur (>0)", async () => {
    const { store } = memStore([funded("s1", "u1", 10, 1000), funded("s2", "u2", 5, 500)]);
    await inscribeDeep(store, DEAL, { tenantId: TENANT });
    const holdings = await getHoldings(store, DEAL, TENANT);
    const u1 = holdings.find((h) => h.walletAddress === "u1");
    const u2 = holdings.find((h) => h.walletAddress === "u2");
    expect(u1?.units).toBe(10);
    expect(u2?.units).toBe(5);
  });
});
