/**
 * lib/invest/ledger/index.ts — ④ Securities Ledger (DEEP) : services DB-backed (Epic 1.4).
 *
 * I1 : SOURCE DE VÉRITÉ juridique des titres — inscrite AVANT tout mint (étape 2
 * de la saga DvP). I10 : registre APPEND-ONLY hash-chaîné.
 *
 * ── HASH-CHAINING (décision documentée) ──────────────────────────────────────
 * La migration 0018 (`inv_cap_table_entries`) NE contient PAS de colonnes
 * `prev_hash` / `entry_hash` (vérifié sur la base réelle) : seules `deep_register_ref`
 * et `notes` (text) sont libres. On chaîne donc APPLICATIVEMENT : le hash de chaque
 * mouvement (sha256 du payload canonique + hash précédent du même deal) est persisté
 * dans `notes` au format JSON `{"prev_hash":…,"entry_hash":…}`. À la lecture, on
 * recompose `LedgerEntry.prevHash/entryHash` et `verifyHashChain` (pur) valide la
 * continuité — toute insertion/suppression rétroactive casse la chaîne (I10).
 *
 * La couche est I/O pure (service-role) : on filtre TOUJOURS `tenant_id` (I9), on
 * `assertTenant` chaque ligne lue, et on passe les transitions de souscription par
 * la machine PURE (`funded → allocated`). Le store est INJECTABLE pour les tests.
 */

import { createHash } from "node:crypto";
import { assertTenant } from "../shared/ownership";
import { InvariantViolationError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { transition } from "../subscription";
import type { SubscriptionStatus } from "../subscription/types";
import type { LedgerEntry, Holding } from "./types";

export * from "./types";

/**
 * Vérifie PUREMENT l'intégrité de la chaîne de hash d'un registre (I10).
 * Recalcule la continuité prev_hash → entry_hash ; toute rupture = altération.
 */
export function verifyHashChain(entries: readonly LedgerEntry[]): boolean {
  let prev: string | null = null;
  for (const e of entries) {
    if (e.prevHash !== prev) return false; // I10 — maillon rompu
    prev = e.entryHash;
  }
  return true;
}

/**
 * Hash d'un maillon (I10). PUR. sha256 d'une représentation canonique du
 * mouvement + hash du maillon précédent (genesis : prev = "").
 */
export function computeEntryHash(input: {
  prevHash: string | null;
  dealId: string;
  subscriptionId: string | null;
  entryType: string;
  units: number;
  balanceUnitsAfter: number;
  deepRegisterRef: string | null;
}): string {
  const canonical = [
    input.prevHash ?? "",
    input.dealId,
    input.subscriptionId ?? "",
    input.entryType,
    String(input.units),
    String(input.balanceUnitsAfter),
    input.deepRegisterRef ?? "",
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Rows DB (sous-ensembles utiles, colonnes RÉELLES 0018/0022) ─────────────

/** Souscription `funded` à inscrire (sous-ensemble inv_subscriptions). */
export interface FundedSubscriptionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  investor_profile_id: string;
  deal_id: string;
  bond_tranche_id: string;
  units: number;
  amount_eur: number;
  status: string;
}

/** Entrée de cap table telle que persistée (colonnes RÉELLES inv_cap_table_entries). */
export interface CapTableRow {
  id: string;
  tenant_id: string;
  deal_id: string;
  bond_tranche_id: string;
  subscription_id: string | null;
  holder_profile_id: string | null;
  holder_user_id: string | null;
  entry_type: string;
  units: number;
  nominal_eur: number;
  balance_units_after: number;
  deep_register_ref: string | null;
  reconciliation_status: string;
  notes: string | null;
  created_at: string;
}

/** Insert d'une entrée de cap table (issuance au closing). */
export interface CapTableInsert {
  deal_id: string;
  bond_tranche_id: string;
  subscription_id: string;
  holder_profile_id: string;
  holder_user_id: string;
  entry_type: "issuance";
  units: number;
  nominal_eur: number;
  balance_units_after: number;
  deep_register_ref: string;
  reconciliation_status: "legal_only";
  /** JSON `{prev_hash, entry_hash}` (chaînage applicatif I10). */
  notes: string;
}

/** Ligne de masse obligataire (sous-ensemble inv_bond_register). */
export interface BondRegisterInsert {
  deal_id: string;
  bond_tranche_id: string;
  holder_user_id: string;
  subscription_id: string;
  state: "INSCRIBED_DEEP";
  nominal_eur: number;
  units: number;
}

/** Inscription DEEP (sous-ensemble inv_deep_inscriptions). */
export interface DeepInscriptionInsert {
  bond_register_id: string;
  registrar: string;
  inscription_ref: string;
  inscribed_at: string;
}

/**
 * Store injectable du registre DEEP. Toutes les méthodes sont filtrées `tenant_id`
 * côté implémentation ; le service ré-asserte l'appartenance (I9).
 */
export interface LedgerStore {
  /** Souscriptions `funded` d'un deal (candidates à l'inscription). Tenant-scopé. */
  listFundedSubscriptions(tenantId: string, dealId: string): Promise<FundedSubscriptionRow[]>;
  /** Dernier maillon de la chaîne DEEP pour un deal (ordre created_at desc). */
  lastEntryForDeal(tenantId: string, dealId: string): Promise<CapTableRow | null>;
  /** Solde courant (units) d'un holder sur une tranche (dernière balance connue). */
  currentBalanceUnits(tenantId: string, bondTrancheId: string, holderUserId: string): Promise<number>;
  /** Insère une entrée de cap table (issuance). Renvoie la ligne créée. */
  insertCapTableEntry(tenantId: string, row: CapTableInsert): Promise<CapTableRow>;
  /** Insère (ou retrouve) la ligne de masse obligataire du porteur. */
  upsertBondRegister(tenantId: string, row: BondRegisterInsert): Promise<{ id: string }>;
  /** Insère l'inscription DEEP rattachée à la masse obligataire. */
  insertDeepInscription(tenantId: string, row: DeepInscriptionInsert): Promise<{ id: string }>;
  /** Passe la souscription `funded → allocated` (statut + allocated_at). Tenant-scopé. */
  markSubscriptionAllocated(tenantId: string, subscriptionId: string): Promise<void>;
  /** Entrées de cap table d'un deal, ordre chronologique (audit / hash-chain). */
  listEntries(tenantId: string, dealId: string): Promise<CapTableRow[]>;
}

// ─── Résultat de service ──────────────────────────────────────────────────────

/** Résultat de l'inscription DEEP d'un deal (étape 2 de la saga). */
export interface InscribeDeepResult {
  dealId: string;
  /** Nombre de souscriptions effectivement inscrites lors de cet appel. */
  inscribed: number;
  /** Souscriptions `funded` vues au total (idempotence : pas re-traitées si 0 inscrites). */
  fundedSeen: number;
  /** Ids des entrées de cap table créées. */
  entryIds: string[];
}

// ─── Mapping Row → vue domaine ────────────────────────────────────────────────

/** Recompose le chaînage depuis `notes` (JSON `{prev_hash, entry_hash}`). */
function parseChain(notes: string | null): { prevHash: string | null; entryHash: string } {
  if (!notes) return { prevHash: null, entryHash: "" };
  try {
    const o = JSON.parse(notes) as { prev_hash?: string | null; entry_hash?: string };
    return { prevHash: o.prev_hash ?? null, entryHash: o.entry_hash ?? "" };
  } catch {
    return { prevHash: null, entryHash: "" };
  }
}

function toLedgerEntry(row: CapTableRow): LedgerEntry {
  const chain = parseChain(row.notes);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    dealId: row.deal_id,
    entryType: row.entry_type as LedgerEntry["entryType"],
    units: Number(row.units),
    nominalEur: Number(row.nominal_eur),
    balanceUnitsAfter: Number(row.balance_units_after),
    deepRegisterRef: row.deep_register_ref,
    reconciliationStatus: row.reconciliation_status as LedgerEntry["reconciliationStatus"],
    prevHash: chain.prevHash,
    entryHash: chain.entryHash,
  };
}

// ─── Services ────────────────────────────────────────────────────────────────

/**
 * Inscrit en DEEP (SOURCE DE VÉRITÉ, I1) toutes les souscriptions `funded` d'un
 * deal — étape 2 de la saga, AVANT tout mint (étape 3). Pour chaque souscription :
 *   1. calcule le nouveau solde du porteur sur la tranche ;
 *   2. chaîne le maillon (prev_hash → entry_hash) et l'écrit dans `inv_cap_table_entries`
 *      (append-only, entry_type=issuance, reconciliation_status=legal_only) ;
 *   3. crée/retrouve la masse obligataire (`inv_bond_register`) + l'inscription
 *      DEEP (`inv_deep_inscriptions`) ;
 *   4. passe la souscription `funded → allocated` via la machine PURE.
 *
 * IDEMPOTENT : ne traite QUE les souscriptions encore `funded`. Un second appel
 * (toutes déjà `allocated`) renvoie `inscribed=0` sans rien réécrire.
 *
 * @throws InvariantViolationError (I9) si une ligne sort du tenant ;
 *         InvariantViolationError (I1) si la machine refuse `funded → allocated`.
 */
export async function inscribeDeep(
  store: LedgerStore,
  dealId: string,
  opts: { tenantId?: string; registrar?: string } = {},
): Promise<InscribeDeepResult> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;
  const registrar = opts.registrar ?? "tokeny";
  if (!dealId) throw new InvariantViolationError("I1", "inscribeDeep sans dealId");

  const funded = await store.listFundedSubscriptions(tenantId, dealId);
  const entryIds: string[] = [];
  let inscribed = 0;

  // Maillon précédent : dernier hash du deal (chaîne par deal).
  const last = await store.lastEntryForDeal(tenantId, dealId);
  let prevHash: string | null = last ? parseChain(last.notes).entryHash || null : null;

  for (const sub of funded) {
    assertTenant(sub as { tenant_id: string }, tenantId);
    // Sécurité machine : on n'inscrit qu'un `funded` (les autres sont ignorés).
    if ((sub.status as SubscriptionStatus) !== "funded") continue;

    const balanceBefore = await store.currentBalanceUnits(tenantId, sub.bond_tranche_id, sub.user_id);
    const balanceAfter = balanceBefore + Number(sub.units);
    const deepRef = `deep:${dealId}:${sub.id}`;

    const entryHash = computeEntryHash({
      prevHash,
      dealId,
      subscriptionId: sub.id,
      entryType: "issuance",
      units: Number(sub.units),
      balanceUnitsAfter: balanceAfter,
      deepRegisterRef: deepRef,
    });

    const entry = await store.insertCapTableEntry(tenantId, {
      deal_id: dealId,
      bond_tranche_id: sub.bond_tranche_id,
      subscription_id: sub.id,
      holder_profile_id: sub.investor_profile_id,
      holder_user_id: sub.user_id,
      entry_type: "issuance",
      units: Number(sub.units),
      nominal_eur: Number(sub.amount_eur),
      balance_units_after: balanceAfter,
      deep_register_ref: deepRef,
      reconciliation_status: "legal_only",
      notes: JSON.stringify({ prev_hash: prevHash, entry_hash: entryHash }),
    });
    assertTenant(entry as { tenant_id: string }, tenantId);
    entryIds.push(entry.id);

    // Masse obligataire + inscription DEEP (acte juridique).
    const reg = await store.upsertBondRegister(tenantId, {
      deal_id: dealId,
      bond_tranche_id: sub.bond_tranche_id,
      holder_user_id: sub.user_id,
      subscription_id: sub.id,
      state: "INSCRIBED_DEEP",
      nominal_eur: Number(sub.amount_eur),
      units: Number(sub.units),
    });
    await store.insertDeepInscription(tenantId, {
      bond_register_id: reg.id,
      registrar,
      inscription_ref: deepRef,
      inscribed_at: new Date().toISOString(),
    });

    // Transition PURE funded → allocated (jamais pilotée hors machine).
    const r = transition("funded", { type: "allocate" });
    if (!r.ok) {
      throw new InvariantViolationError("I1", `transition funded→allocated refusée (${sub.id})`);
    }
    await store.markSubscriptionAllocated(tenantId, sub.id);

    prevHash = entryHash;
    inscribed += 1;
  }

  return { dealId, inscribed, fundedSeen: funded.length, entryIds };
}

/**
 * Cap table off-chain agrégée (état courant opposable, source de vérité I1).
 * Conserve le DERNIER solde connu par holder (chronologie ordonnée par le store).
 */
export async function getHoldings(store: LedgerStore, dealId: string, tenantId = DEFAULT_TENANT_ID): Promise<Holding[]> {
  const rows = await store.listEntries(tenantId, dealId);
  const last = new Map<string, number>();
  for (const r of rows) {
    assertTenant(r as { tenant_id: string }, tenantId);
    const key = r.holder_user_id ?? r.holder_profile_id ?? "spv";
    last.set(key, Number(r.balance_units_after));
  }
  return Array.from(last.entries())
    .filter(([, units]) => units > 0)
    .map(([walletAddress, units]) => ({ walletAddress, units }));
}

/** Journal append-only du registre (audit + vérif hash-chain I10). */
export async function getEntries(store: LedgerStore, dealId: string, tenantId = DEFAULT_TENANT_ID): Promise<LedgerEntry[]> {
  const rows = await store.listEntries(tenantId, dealId);
  return rows.map((r) => {
    assertTenant(r as { tenant_id: string }, tenantId);
    return toLedgerEntry(r);
  });
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES 0018/0022) ─

const CAP_COLS =
  "id, tenant_id, deal_id, bond_tranche_id, subscription_id, holder_profile_id, holder_user_id, " +
  "entry_type, units, nominal_eur, balance_units_after, deep_register_ref, reconciliation_status, notes, created_at";

/**
 * Store Supabase aligné sur les colonnes RÉELLES (vérifiées sur la base) :
 *   - inv_cap_table_entries (0018) — pas de prev_hash/entry_hash → chaîne dans `notes` ;
 *   - inv_bond_register / inv_deep_inscriptions (0022) ;
 *   - inv_subscriptions (0017) pour la transition funded→allocated.
 * Service-role → on filtre `tenant_id` explicitement partout (I9).
 */
export function supabaseLedgerStore(): LedgerStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[ledger] Supabase service-role non configuré");

  return {
    async listFundedSubscriptions(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select("id, tenant_id, user_id, investor_profile_id, deal_id, bond_tranche_id, units, amount_eur, status")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("status", "funded")
        .order("funded_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as FundedSubscriptionRow[]) ?? [];
    },

    async lastEntryForDeal(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .select(CAP_COLS)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CapTableRow | null) ?? null;
    },

    async currentBalanceUnits(tenantId, bondTrancheId, holderUserId) {
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .select("balance_units_after, created_at")
        .eq("tenant_id", tenantId)
        .eq("bond_tranche_id", bondTrancheId)
        .eq("holder_user_id", holderUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as { balance_units_after: number } | null;
      return row ? Number(row.balance_units_after) : 0;
    },

    async insertCapTableEntry(tenantId, row) {
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .insert({ tenant_id: tenantId, ...row })
        .select(CAP_COLS)
        .single();
      if (error || !data) throw error ?? new Error("insert_cap_table_failed");
      return data as unknown as CapTableRow;
    },

    async upsertBondRegister(tenantId, row) {
      // Retrouve une ligne existante pour cette souscription (idempotence).
      const { data: existing, error: findErr } = await db
        .from("inv_bond_register")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("subscription_id", row.subscription_id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) return { id: (existing as { id: string }).id };

      const { data, error } = await db
        .from("inv_bond_register")
        .insert({ tenant_id: tenantId, inscribed_at: new Date().toISOString(), ...row })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_bond_register_failed");
      return { id: (data as { id: string }).id };
    },

    async insertDeepInscription(tenantId, row) {
      const { data, error } = await db
        .from("inv_deep_inscriptions")
        .insert({ tenant_id: tenantId, ...row })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_deep_inscription_failed");
      return { id: (data as { id: string }).id };
    },

    async markSubscriptionAllocated(tenantId, subscriptionId) {
      const { error } = await db
        .from("inv_subscriptions")
        .update({ status: "allocated", allocated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", subscriptionId)
        .eq("status", "funded"); // garde concurrente : ne touche qu'un funded
      if (error) throw error;
    },

    async listEntries(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .select(CAP_COLS)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as CapTableRow[]) ?? [];
    },
  };
}
