/**
 * lib/agent-gateway/idempotent-write.ts — enrobe une écriture métier avec la
 * garde d'idempotence (§2) : lookup → reserve → write → complete. Un rejeu
 * avec la même clé (tenant, interface, idem_key) renvoie la réponse mémorisée
 * sans ré-exécuter l'écriture.
 */
import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import {
  bodyHash,
  lookupGatewayIdempotent,
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
  const cached = await lookupGatewayIdempotent(tenantId, interfaceName, idemKey);
  if (cached !== null) {
    return { ...(cached as unknown as GatewayHandlerResult<TData>) };
  }

  const reserved = await reserveGatewayIdempotent(
    tenantId,
    interfaceName,
    idemKey,
    bodyHash(payloadForHash),
  );
  if (!reserved) {
    // Course perdue / rejeu concurrent en cours : ni un succès ni une donnée
    // fabriquée — on signale UNAVAILABLE avec raison explicite plutôt que de
    // dupliquer l'écriture.
    return { status: "UNAVAILABLE", reason: "idempotency_in_progress" };
  }

  const result = await write();
  await completeGatewayIdempotent(tenantId, interfaceName, idemKey, result as unknown as Json);
  return result;
}
