/**
 * lib/invest/ledger/types.ts — ④ Securities Ledger (DEEP) : types de domaine.
 *
 * I1 : SOURCE DE VÉRITÉ juridique des titres. I10 : append-only hash-chaîné.
 * Alignés sur la migration 0018 :
 *   - inv_cap_table_entries.entry_type : issuance|transfer_in|transfer_out|redemption|correction
 *   - inv_cap_table_entries.reconciliation_status : legal_only|synced|divergent
 */

import type { Eur, TenantId } from "../shared/types";

/** Nature d'un mouvement de titres (aligné inv_cap_table_entries.entry_type). */
export type LedgerEntryType =
  | "issuance" // émission primaire (au closing)
  | "transfer_in" // entrée par transfert secondaire P2P whitelisté
  | "transfer_out" // sortie par transfert secondaire
  | "redemption" // remboursement (exit) → extinction
  | "correction"; // correction administrative (rare, tracée)

/** État de réconciliation off-chain↔on-chain (aligné DB ; DEEP prime — §5.2). */
export type ReconciliationStatus = "legal_only" | "synced" | "divergent";

/**
 * Entrée du registre (vue domaine, sous-ensemble de inv_cap_table_entries).
 * IMMUABLE (I10) : jamais d'UPDATE/DELETE ; chaînage par hash.
 */
export interface LedgerEntry {
  id: string;
  tenantId: TenantId;
  dealId: string;
  entryType: LedgerEntryType;
  units: number;
  nominalEur: Eur;
  /** Solde du détenteur APRÈS ce mouvement (dénormalisé). */
  balanceUnitsAfter: number;
  /** Réf d'inscription DEEP du mouvement (ancrage légal I1). */
  deepRegisterRef: string | null;
  reconciliationStatus: ReconciliationStatus;
  /** Chaînage d'intégrité (I10) : hash du payload + hash précédent. */
  prevHash: string | null;
  entryHash: string;
}

/** Position d'un porteur sur une tranche (cap table = état agrégé du registre). */
export interface Holding {
  walletAddress: string;
  units: number;
}
