/**
 * lib/invest/tokenization/index.ts — ⑥ Tokenization (MIROIR) : services DB-backed (Epic 1.4).
 *
 * Le token ERC-3643 est un MIROIR (I1) : il SUIT le Ledger DEEP (④), jamais
 * l'inverse. Ce module :
 *   - `mintMirror`  : étape 3 de la saga (APRÈS DEEP) — par holding alloué, mint
 *     idempotent (`mint:{subscriptionId}`) via TokenizationPort → `inv_token_mints`.
 *   - `reconcile`   : étape 4 — compare Σ DEEP (inv_cap_table_entries) vs Σ chaîne
 *     (inv_chain_events) via la règle PURE `reconcileWallet` (DEEP gagne) →
 *     `inv_reconciliation_runs`.
 *
 * ── FAIL-SOFT TOTAL (I7) ──────────────────────────────────────────────────────
 * Sans clés Tokeny → `TokenizationPort.mint` lève `ProviderUnavailableError` AVANT
 * tout appel réseau : on capture, on écrit le mint en `status='pending'` et la saga
 * NE s'interrompt PAS (aucun closing réel sur chaîne). Sans indexer chaîne (aucun
 * `inv_chain_events`) la réconciliation est `legal_only` (DEEP seul) → `in_sync`.
 *
 * ── DÉCISION TESTNET (documentée) ─────────────────────────────────────────────
 * En l'absence de chaîne, on considère le DEEP comme l'autorité : la souscription
 * passe `allocated → minted` dès que le maillon DEEP existe, MÊME si le mint est
 * `pending` (le miroir se régularisera à la première passe de réconciliation quand
 * l'indexer sera branché). `minted` reflète ici l'INSCRIPTION LÉGALE aboutie, pas
 * la confirmation on-chain — cohérent avec I1 (DEEP = source de vérité).
 *
 * Couche I/O service-role : filtrage `tenant_id` (I9), `assertTenant`, transitions
 * via la machine PURE (`allocated → minted`). Store INJECTABLE pour les tests.
 */

import { assertTenant } from "../shared/ownership";
import { ProviderUnavailableError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { withIdempotency, hashBody, supabaseIdempotencyStore, type IdempotencyStore } from "../shared/idempotency";
import { transition } from "../subscription";
import type { SubscriptionStatus } from "../subscription/types";
import { getTokenizationPort, getChainPort } from "../adapters";
import type { TokenizationPort } from "../ports/tokenization";
import type { ChainPort } from "../ports/chain";
import type { ReconciliationResult } from "./types";

export * from "./types";

/**
 * Règle d'or PURE de réconciliation DEEP↔chaîne (§5.2).
 * DEEP (expected) gagne TOUJOURS :
 *  - chaîne == DEEP            → in_sync
 *  - chaîne <  DEEP            → mint_missing (ré-émettre le mint, idempotent)
 *  - chaîne >  DEEP            → chain_exceeds_deep (ANOMALIE → pause + escalade)
 */
export function reconcileWallet(input: {
  expectedUnits: number; // Σ inv_cap_table_entries — source de vérité I1
  onchainUnits: number; // balance ERC-3643 (inv_chain_events)
}): ReconciliationResult {
  if (input.onchainUnits === input.expectedUnits) return "in_sync";
  if (input.onchainUnits < input.expectedUnits) return "mint_missing";
  return "chain_exceeds_deep"; // I1 — on ne « régularise » jamais DEEP sur la chaîne
}

// ─── Rows DB (sous-ensembles, colonnes RÉELLES 0017/0018/0021/0024) ──────────

/** Souscription `allocated` (inscrite DEEP) candidate au mint miroir. */
export interface AllocatedSubscriptionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  investor_profile_id: string;
  deal_id: string;
  bond_tranche_id: string;
  units: number;
  status: string;
}

/** Tranche (adresses on-chain + chaîne) — sous-ensemble inv_bond_tranches. */
export interface TrancheChainInfo {
  id: string;
  tenant_id: string;
  chain: string | null;
  token_contract_address: string | null;
  token_standard: string | null;
}

/** Insert d'une opération de mint (colonnes RÉELLES inv_token_mints). */
export interface TokenMintInsert {
  bond_tranche_id: string;
  deal_id: string;
  holder_profile_id: string;
  to_wallet_address: string | null;
  operation: "mint";
  units: number;
  chain: string;
  contract_address: string | null;
  tx_hash: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed" | "reverted";
  compliance_checked: boolean;
  error_message: string | null;
}

/** Agrégat DEEP par holder (Σ balance courante du registre). */
export interface DeepHolding {
  holderKey: string; // holder_user_id ?? holder_profile_id
  units: number;
}

/** Agrégat chaîne par holder/wallet (Σ inv_chain_events). */
export interface ChainHolding {
  holderKey: string;
  units: number;
}

/** Run de réconciliation persisté (sous-ensemble inv_reconciliation_runs). */
export interface ReconciliationRunInsert {
  deal_id: string;
  bond_tranche_id: string | null;
  result: ReconciliationResult;
  drift: unknown;
  actions: unknown;
  status: "completed" | "failed";
  triggered_pause: boolean;
  error_message: string | null;
  finished_at: string;
}

/** Store injectable de la tokenisation (miroir + réconciliation). */
export interface TokenizationStore {
  /** Souscriptions `allocated` d'un deal (inscrites DEEP, à minter). Tenant-scopé. */
  listAllocatedSubscriptions(tenantId: string, dealId: string): Promise<AllocatedSubscriptionRow[]>;
  /** Info chaîne d'une tranche (adresse contrat, chaîne). */
  findTrancheChainInfo(tenantId: string, trancheId: string): Promise<TrancheChainInfo | null>;
  /** Insère une opération de mint (idempotence appliquée en amont). */
  insertTokenMint(tenantId: string, row: TokenMintInsert): Promise<{ id: string }>;
  /** Passe la souscription `allocated → minted` (statut + minted_at). Tenant-scopé. */
  markSubscriptionMinted(tenantId: string, subscriptionId: string): Promise<void>;
  /** Σ DEEP par holder (dernière balance connue par holder du deal). Vérité I1. */
  deepHoldings(tenantId: string, dealId: string): Promise<DeepHolding[]>;
  /** Σ chaîne par holder (inv_chain_events) du deal. Reflet (jamais vérité). */
  chainHoldings(tenantId: string, dealId: string): Promise<ChainHolding[]>;
  /** Écrit un run de réconciliation. */
  insertReconciliationRun(tenantId: string, row: ReconciliationRunInsert): Promise<{ id: string }>;
}

// ─── Résultats de service ─────────────────────────────────────────────────────

/** Résultat du mint miroir d'un deal (étape 3). */
export interface MintMirrorResult {
  dealId: string;
  /** Mints confirmés on-chain (port configuré). */
  minted: number;
  /** Mints marqués `pending` (port absent → fail-soft, AUCUN échec). */
  pending: number;
  /** Souscriptions `allocated` vues. */
  allocatedSeen: number;
  /** True si le port tokenisation n'est pas configuré (mode fail-soft). */
  failSoft: boolean;
}

/** Résultat d'une passe de réconciliation (étape 4). */
export interface ReconcileResult {
  dealId: string;
  /** `legal_only` (pas de chaîne) | `in_sync` | `mint_missing` | `chain_exceeds_deep`. */
  outcome: ReconciliationResult | "legal_only";
  /** True si chaîne > DEEP (anomalie) → pause + escalade. */
  pause: boolean;
  /** Détail par holder (expected DEEP vs onchain). */
  drift: Array<{ holderKey: string; expectedUnits: number; onchainUnits: number; result: ReconciliationResult }>;
  runId: string | null;
}

// ─── Service : MINT MIROIR (étape 3, APRÈS DEEP) ──────────────────────────────

/**
 * Mint le miroir on-chain de toutes les souscriptions `allocated` d'un deal
 * (étape 3 de la saga). Pour chaque holding :
 *   1. mint idempotent (`mint:{subscriptionId}`) via TokenizationPort ;
 *   2. écrit `inv_token_mints` (status=confirmed si port OK, sinon pending) ;
 *   3. passe `allocated → minted` (machine PURE).
 *
 * FAIL-SOFT : port non configuré → `ProviderUnavailableError` capturé → mint
 * `pending`, AUCUN échec, la souscription passe quand même `minted` (cf. décision
 * testnet documentée en tête de module). IDEMPOTENT : ne traite que les `allocated`.
 */
export async function mintMirror(
  store: TokenizationStore,
  dealId: string,
  deps: { port?: TokenizationPort; idempotency?: IdempotencyStore; tenantId?: string } = {},
): Promise<MintMirrorResult> {
  const tenantId = deps.tenantId ?? DEFAULT_TENANT_ID;
  const port = deps.port ?? getTokenizationPort();
  const idem = deps.idempotency ?? supabaseIdempotencyStore(tenantId);
  const configured = port.isConfigured();

  const allocated = await store.listAllocatedSubscriptions(tenantId, dealId);
  let minted = 0;
  let pending = 0;

  for (const sub of allocated) {
    assertTenant(sub as { tenant_id: string }, tenantId);
    if ((sub.status as SubscriptionStatus) !== "allocated") continue;

    const tranche = await store.findTrancheChainInfo(tenantId, sub.bond_tranche_id);
    const chain = tranche?.chain ?? "permissioned";
    const contract = tranche?.token_contract_address ?? null;

    // Mint idempotent (I8). Le résultat (txHash/status) est mémorisé par clé.
    let status: TokenMintInsert["status"] = "pending";
    let txHash: string | null = null;
    let errorMessage: string | null = null;

    try {
      const { result } = await withIdempotency(
        idem,
        { key: `mint:${sub.id}`, bodyHash: hashBody({ subId: sub.id, units: sub.units }) },
        async () => {
          if (!configured || !contract) {
            // Fail-soft : aucun appel réseau possible → on mémorise un pending.
            return { txHash: null as string | null, status: "pending" as TokenMintInsert["status"] };
          }
          const op = await port.mint({
            contract,
            to: contract, // wallet destinataire câblé au Jalon 2 (registre OnchainID)
            units: Number(sub.units),
            idempotencyKey: `mint:${sub.id}`,
          });
          return { txHash: op.txHash, status: op.status as TokenMintInsert["status"] };
        },
      );
      status = result.status;
      txHash = result.txHash;
    } catch (e) {
      // FAIL-SOFT : provider absent / erreur réseau → pending, JAMAIS d'échec dur.
      if (!(e instanceof ProviderUnavailableError)) {
        errorMessage = e instanceof Error ? e.message : String(e);
      }
      status = "pending";
      txHash = null;
    }

    await store.insertTokenMint(tenantId, {
      bond_tranche_id: sub.bond_tranche_id,
      deal_id: dealId,
      holder_profile_id: sub.investor_profile_id,
      to_wallet_address: null,
      operation: "mint",
      units: Number(sub.units),
      chain,
      contract_address: contract,
      tx_hash: txHash,
      status,
      compliance_checked: false,
      error_message: errorMessage,
    });

    if (status === "confirmed" || status === "submitted") minted += 1;
    else pending += 1;

    // Décision testnet : DEEP fait foi → on marque `minted` même si mint pending.
    const r = transition("allocated", { type: "mint" });
    if (r.ok) await store.markSubscriptionMinted(tenantId, sub.id);
  }

  return {
    dealId,
    minted,
    pending,
    allocatedSeen: allocated.length,
    failSoft: !configured,
  };
}

// ─── Service : RÉCONCILIATION DEEP↔chaîne (étape 4) ───────────────────────────

/**
 * Lance une passe de réconciliation pour un deal (étape 4 de la saga + cron 5 min).
 * Compare Σ DEEP (vérité) vs Σ chaîne (inv_chain_events) par holder :
 *   - aucune donnée chaîne → `legal_only` (DEEP seul, in_sync) ;
 *   - chaîne == DEEP       → in_sync ;
 *   - chaîne <  DEEP       → mint_missing (le mint se rejouera, idempotent) ;
 *   - chaîne >  DEEP       → chain_exceeds_deep → PAUSE + escalade (DEEP prime).
 *
 * Écrit toujours un `inv_reconciliation_runs`. Ne lève jamais en mode fail-soft.
 */
export async function reconcile(
  store: TokenizationStore,
  dealId: string,
  deps: { chain?: ChainPort; tenantId?: string; bondTrancheId?: string | null } = {},
): Promise<ReconcileResult> {
  const tenantId = deps.tenantId ?? DEFAULT_TENANT_ID;
  const chainPort = deps.chain ?? getChainPort();
  const chainConfigured = chainPort.isConfigured();

  const deep = await store.deepHoldings(tenantId, dealId);
  const onchain = chainConfigured ? await store.chainHoldings(tenantId, dealId) : [];

  // Pas de source chaîne (indexer absent OU aucun event) → legal_only.
  const legalOnly = !chainConfigured || onchain.length === 0;

  const chainMap = new Map<string, number>();
  for (const c of onchain) chainMap.set(c.holderKey, c.units);

  const drift: ReconcileResult["drift"] = [];
  let worst: ReconciliationResult = "in_sync";
  for (const d of deep) {
    const onchainUnits = chainMap.get(d.holderKey) ?? 0;
    const result = legalOnly ? "in_sync" : reconcileWallet({ expectedUnits: d.units, onchainUnits });
    drift.push({ holderKey: d.holderKey, expectedUnits: d.units, onchainUnits, result });
    // Priorité de gravité : chain_exceeds_deep > mint_missing > in_sync.
    if (result === "chain_exceeds_deep") worst = "chain_exceeds_deep";
    else if (result === "mint_missing" && worst !== "chain_exceeds_deep") worst = "mint_missing";
  }
  // Détecte aussi un holder PRÉSENT on-chain mais ABSENT du DEEP (anomalie grave).
  if (!legalOnly) {
    const deepKeys = new Set(deep.map((d) => d.holderKey));
    for (const c of onchain) {
      if (!deepKeys.has(c.holderKey) && c.units > 0) {
        worst = "chain_exceeds_deep";
        drift.push({ holderKey: c.holderKey, expectedUnits: 0, onchainUnits: c.units, result: "chain_exceeds_deep" });
      }
    }
  }

  const outcome: ReconcileResult["outcome"] = legalOnly ? "legal_only" : worst;
  const pause = worst === "chain_exceeds_deep";
  // Le résultat persisté est borné à l'enum DB (legal_only n'y figure pas → in_sync).
  const dbResult: ReconciliationResult = legalOnly ? "in_sync" : worst;

  const run = await store.insertReconciliationRun(tenantId, {
    deal_id: dealId,
    bond_tranche_id: deps.bondTrancheId ?? null,
    result: dbResult,
    drift: { legalOnly, holders: drift },
    actions: pause
      ? { paused: true, reason: "chain_exceeds_deep", note: "DEEP prime — escalade compliance" }
      : { note: legalOnly ? "legal_only (indexer absent ou aucun event chaîne)" : "synced" },
    status: "completed",
    triggered_pause: pause,
    error_message: null,
    finished_at: new Date().toISOString(),
  });

  return { dealId, outcome, pause, drift, runId: run.id };
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES) ──────────

/**
 * Store Supabase aligné sur les colonnes RÉELLES (vérifiées) :
 *   - inv_subscriptions (0017), inv_bond_tranches (0016) ;
 *   - inv_token_mints (0018), inv_cap_table_entries (0018) ;
 *   - inv_chain_events (0024), inv_reconciliation_runs (0021).
 * Service-role → filtrage `tenant_id` partout (I9).
 */
export function supabaseTokenizationStore(): TokenizationStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[tokenization] Supabase service-role non configuré");

  return {
    async listAllocatedSubscriptions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select("id, tenant_id, user_id, investor_profile_id, deal_id, bond_tranche_id, units, status")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("status", "allocated")
        .order("allocated_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as AllocatedSubscriptionRow[]) ?? [];
    },

    async findTrancheChainInfo(tenantId, trancheId) {
      const { data, error } = await db
        .from("inv_bond_tranches")
        .select("id, tenant_id, chain, token_contract_address, token_standard")
        .eq("tenant_id", tenantId)
        .eq("id", trancheId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TrancheChainInfo | null) ?? null;
    },

    async insertTokenMint(tenantId, row) {
      const { data, error } = await db
        .from("inv_token_mints")
        .insert({ tenant_id: tenantId, ...row })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_token_mint_failed");
      return { id: (data as { id: string }).id };
    },

    async markSubscriptionMinted(tenantId, subscriptionId) {
      const { error } = await db
        .from("inv_subscriptions")
        .update({ status: "minted", minted_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", subscriptionId)
        .eq("status", "allocated"); // garde : ne touche qu'un allocated
      if (error) throw error;
    },

    async deepHoldings(tenantId, dealId) {
      // Dernière balance connue par holder (chronologie), source de vérité I1.
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .select("holder_user_id, holder_profile_id, balance_units_after, created_at")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data as { holder_user_id: string | null; holder_profile_id: string | null; balance_units_after: number }[] | null) ?? [];
      const last = new Map<string, number>();
      for (const r of rows) {
        const key = r.holder_user_id ?? r.holder_profile_id ?? "spv";
        last.set(key, Number(r.balance_units_after));
      }
      return Array.from(last.entries())
        .filter(([, units]) => units > 0)
        .map(([holderKey, units]) => ({ holderKey, units }));
    },

    async chainHoldings(tenantId, dealId) {
      // Σ units par wallet observé on-chain (mint=+, burn=−). Reflet, jamais vérité.
      const { data, error } = await db
        .from("inv_chain_events")
        .select("to_wallet, from_wallet, units, event_name")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId);
      if (error) throw error;
      const rows = (data as { to_wallet: string | null; from_wallet: string | null; units: number | null; event_name: string }[] | null) ?? [];
      const bal = new Map<string, number>();
      for (const r of rows) {
        const u = Number(r.units ?? 0);
        if (r.to_wallet) bal.set(r.to_wallet, (bal.get(r.to_wallet) ?? 0) + u);
        if (r.from_wallet) bal.set(r.from_wallet, (bal.get(r.from_wallet) ?? 0) - u);
      }
      return Array.from(bal.entries())
        .filter(([, units]) => units !== 0)
        .map(([holderKey, units]) => ({ holderKey, units }));
    },

    async insertReconciliationRun(tenantId, row) {
      const { data, error } = await db
        .from("inv_reconciliation_runs")
        .insert({ tenant_id: tenantId, ...row, drift: row.drift as never, actions: row.actions as never })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_reconciliation_run_failed");
      return { id: (data as { id: string }).id };
    },
  };
}
