/**
 * lib/invest/shared/dlq-drain.ts — Drain/replay automatique de la DLQ (Pattern C).
 *
 * `drainFailedOperations` lit les entrées `open` de `inv_failed_operations` et
 * rejoue les opérations éligibles (op_kind === 'refund') via EscrowPort.refund.
 * Les autres op_kind sont laissés `skipped` (aucun handler inventé).
 *
 * Idempotence : la clé idempotence est portée par `payload.idempotencyKey`
 * (même convention que watchdog.ts : `refund:{subscriptionId}`). L'escrow est
 * lui-même idempotent (I8) — un rejeu sur la même clé renvoie la même réponse.
 *
 * Fail-soft par ligne : un throw sur une ligne n'interrompt pas le traitement
 * des autres. Les erreurs de `mark*` elles-mêmes sont catchées séparément.
 */

import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "./types";
import type { EscrowPort, EscrowProvider } from "../ports/escrow";

const DEFAULT_ESCROW_PROVIDER: EscrowProvider = "notaire";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Ligne de `inv_failed_operations` telle que lue par le drain. */
export interface FailedOpRow {
  id: string;
  tenant_id: string;
  deal_id: string | null;
  subscription_id: string | null;
  op_kind: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  last_error: string | null;
  status: string;
}

/** Store injectable pour le drain DLQ. */
export interface DlqDrainStore {
  /** Liste les entrées `open` limitées à `limit` lignes, filtrées par tenant. */
  listOpen(tenantId: string, limit: number): Promise<FailedOpRow[]>;
  /** Passe une entrée → `resolved` (+ resolved_at). */
  markResolved(id: string): Promise<void>;
  /** Passe une entrée → `retrying`, incrémente attempts, met à jour last_error. */
  markRetry(id: string, attempts: number, lastError: string): Promise<void>;
  /** Passe une entrée → `abandoned`, met à jour last_error. */
  markAbandoned(id: string, lastError: string): Promise<void>;
}

/** Résultat d'une passe de drain. */
export interface DrainResult {
  scanned: number;
  resolved: number;
  retrying: number;
  abandoned: number;
  skipped: number;
}

// ─── Adaptateur Supabase par défaut ──────────────────────────────────────────

/**
 * Store Supabase aligné sur `inv_failed_operations` (migration 0021).
 * Service-role → filtrage `tenant_id` explicite sur chaque requête (I9).
 *
 * @param tenantId tenant courant (défaut : DEFAULT_TENANT_ID).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function supabaseDlqDrainStore(_tenantId: string = DEFAULT_TENANT_ID): DlqDrainStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[dlq-drain] Supabase service-role non configuré");

  return {
    async listOpen(tid, limit) {
      const { data, error } = await db
        .from("inv_failed_operations")
        .select(
          "id, tenant_id, deal_id, subscription_id, op_kind, payload, attempts, last_error, status",
        )
        .eq("tenant_id", tid)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as FailedOpRow[]) ?? [];
    },

    async markResolved(id) {
      const { error } = await db
        .from("inv_failed_operations")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },

    async markRetry(id, attempts, lastError) {
      const { error } = await db
        .from("inv_failed_operations")
        .update({ status: "retrying", attempts, last_error: lastError })
        .eq("id", id);
      if (error) throw error;
    },

    async markAbandoned(id, lastError) {
      const { error } = await db
        .from("inv_failed_operations")
        .update({ status: "abandoned", last_error: lastError })
        .eq("id", id);
      if (error) throw error;
    },
  };
}

// ─── CORE : drainFailedOperations ─────────────────────────────────────────────

export interface DrainFailedOperationsArgs {
  store: DlqDrainStore;
  escrow: EscrowPort;
  /** Tenant ciblé (défaut : DEFAULT_TENANT_ID). */
  tenantId?: string;
  /** Nombre max d'entrées à traiter par passe (défaut : 50). */
  limit?: number;
  /** Nombre max de tentatives avant abandon (défaut : 5). */
  maxAttempts?: number;
  /**
   * Callback d'observabilité pour les erreurs non-récupérables (ex: `captureFatal`
   * depuis `lib/server/observe`). No-op si absent — injecter en production.
   */
  onError?: (err: unknown, ctx: string) => void;
}

/**
 * Rejoue les opérations ouvertes en DLQ.
 *
 * - `op_kind === 'refund'` : replay via `escrow.refund(...)` avec la clé
 *   idempotence du payload → `markResolved` si ok, `markRetry`/`markAbandoned` si ko.
 * - Autres op_kind → `skipped` (entrée laissée `open`, aucun handler inventé).
 * - `escrow.isConfigured() === false` → tout `skipped`.
 * - Fail-soft par ligne : un throw n'interrompt pas les autres lignes.
 */
export async function drainFailedOperations({
  store,
  escrow,
  tenantId = DEFAULT_TENANT_ID,
  limit = 50,
  maxAttempts = 5,
  onError,
}: DrainFailedOperationsArgs): Promise<DrainResult> {
  // Fail-soft : si onError n'est pas injecté, les erreurs mark* sont silencieuses.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reportError = onError ?? ((_err: unknown, _ctx: string) => undefined);
  const result: DrainResult = { scanned: 0, resolved: 0, retrying: 0, abandoned: 0, skipped: 0 };

  // Si l'escrow n'est pas configuré on ne peut rejouer aucun refund.
  if (!escrow.isConfigured()) {
    // On compte quand même les lignes pour le reporting.
    let rows: FailedOpRow[] = [];
    try {
      rows = await store.listOpen(tenantId, limit);
    } catch {
      // listOpen en échec → on retourne skipped:0 (on n'a pas pu scanner).
      return result;
    }
    result.scanned = rows.length;
    result.skipped = rows.length;
    return result;
  }

  let rows: FailedOpRow[];
  try {
    rows = await store.listOpen(tenantId, limit);
  } catch {
    return result;
  }

  result.scanned = rows.length;

  for (const op of rows) {
    try {
      // Seul op_kind 'refund' est géré ; les autres sont laissés open.
      if (op.op_kind !== "refund") {
        result.skipped += 1;
        continue;
      }

      const payload = op.payload ?? {};

      // FIX-1 : valider idempotencyKey avant tout.
      const rawKey = payload.idempotencyKey;
      if (typeof rawKey !== "string" || rawKey.trim() === "") {
        try {
          await store.markAbandoned(op.id, "missing_idempotency_key");
          result.abandoned += 1;
        } catch (markErr) {
          reportError(markErr, "dlq-drain:markAbandoned:missing_idempotency_key");
        }
        continue;
      }
      const idempotencyKey = rawKey;

      // FIX-1 : valider amountEur (doit être un number > 0).
      const rawAmount = payload.amountEur;
      if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount <= 0) {
        try {
          await store.markAbandoned(op.id, "missing_amount");
          result.abandoned += 1;
        } catch (markErr) {
          reportError(markErr, "dlq-drain:markAbandoned:missing_amount");
        }
        continue;
      }
      const amountEur = rawAmount;

      const dealId = op.deal_id ?? "";
      const accountRef = `escrow:${dealId}`;

      let refundError: string | null = null;
      try {
        await escrow.refund({
          account: {
            dealId,
            provider: DEFAULT_ESCROW_PROVIDER,
            externalRef: accountRef,
          },
          subscriptionId: op.subscription_id ?? op.id,
          amountEur,
          idempotencyKey,
        });
      } catch (e) {
        refundError = e instanceof Error ? e.message : String(e);
      }

      if (refundError === null) {
        // Succès → resolved ; on n'incrémente QU'APRÈS que markResolved réussit.
        try {
          await store.markResolved(op.id);
          result.resolved += 1;
        } catch (markErr) {
          // markResolved a échoué : la ligne reste open, on NE compte PAS resolved.
          reportError(markErr, "dlq-drain:markResolved");
        }
      } else {
        // Échec → retry ou abandon selon le nombre de tentatives déjà effectuées.
        const newAttempts = op.attempts + 1;
        if (newAttempts < maxAttempts) {
          try {
            await store.markRetry(op.id, newAttempts, refundError);
            result.retrying += 1;
          } catch (markErr) {
            // markRetry a échoué : la ligne reste open, on NE compte PAS retrying.
            reportError(markErr, "dlq-drain:markRetry");
          }
        } else {
          try {
            await store.markAbandoned(op.id, refundError);
            result.abandoned += 1;
          } catch (markErr) {
            // markAbandoned a échoué : la ligne reste open, on NE compte PAS abandoned.
            reportError(markErr, "dlq-drain:markAbandoned");
          }
        }
      }
    } catch (lineErr) {
      // Sécurité : catch global par ligne pour absorber toute erreur imprévue.
      reportError(lineErr, "dlq-drain:line");
      result.skipped += 1;
    }
  }

  // FIX-4 : log visible si des lignes non-drainables restent open.
  if (result.skipped > 0) {
    const opKinds = [...new Set(rows.filter((r) => r.op_kind !== "refund").map((r) => r.op_kind))];
    console.warn(
      `[dlq-drain] ${result.skipped} op(s) non-drainables laissées open (op_kinds: ${opKinds.length > 0 ? opKinds.join(", ") : "unknown"})`,
    );
  }

  return result;
}
