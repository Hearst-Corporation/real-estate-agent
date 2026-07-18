/**
 * lib/agent-gateway/idempotent-write.ts — enrobe une écriture métier avec la
 * garde d'idempotence : conflit-hash → lookup → reserve → write → complete.
 *
 * Durcissement A2 — détection de CONFLIT sur payload divergent :
 *   - même (tenant, interface, idem_key) DÉJÀ vue avec un HASH de payload
 *     DIFFÉRENT → DENIED (`idempotency_key_conflict`). On ne rejoue pas, on ne
 *     réécrit pas : réutiliser une clé pour un payload autre est une faute
 *     d'appelant, signalée explicitement.
 *   - même clé + même hash, déjà `completed` → on renvoie la réponse mémorisée
 *     (rejeu idempotent légitime, aucun second effet).
 *   - même clé + même hash, `running` (course concurrente) → UNAVAILABLE
 *     (`idempotency_in_progress`), jamais un doublon.
 */
import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import {
  bodyHash,
  lookupGatewayRecord,
  reserveGatewayIdempotent,
  completeGatewayIdempotent,
} from "./idempotency";
import type { GatewayHandlerResult } from "./handler";

export async function runIdempotentWrite<TData extends Record<string, unknown>>(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
  payloadForHash: unknown,
  write: () => Promise<GatewayHandlerResult<TData>>,
): Promise<GatewayHandlerResult<TData>> {
  const hash = bodyHash(payloadForHash);

  const existing = await lookupGatewayRecord(tenantId, interfaceName, idemKey);
  if (existing) {
    // Conflit : la clé a déjà servi pour un payload DIFFÉRENT.
    if (existing.bodyHash && existing.bodyHash !== hash) {
      return { status: "DENIED", reason: "idempotency_key_conflict" };
    }
    // Rejeu légitime déjà finalisé : renvoie la réponse mémorisée.
    if (existing.status === "completed" && existing.response !== null) {
      return { ...(existing.response as unknown as GatewayHandlerResult<TData>) };
    }
    // Même hash mais encore `running` : course concurrente, pas de second effet.
    return { status: "UNAVAILABLE", reason: "idempotency_in_progress" };
  }

  const reserved = await reserveGatewayIdempotent(tenantId, interfaceName, idemKey, hash);
  if (!reserved) {
    // Course perdue entre le lookup et le reserve (rejeu concurrent) : ni un
    // succès ni une donnée fabriquée — UNAVAILABLE avec raison explicite.
    return { status: "UNAVAILABLE", reason: "idempotency_in_progress" };
  }

  const result = await write();
  await completeGatewayIdempotent(tenantId, interfaceName, idemKey, result as unknown as Json);
  return result;
}
