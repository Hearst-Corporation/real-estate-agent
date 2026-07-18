/**
 * lib/agent-gateway/idempotency.ts — idempotence applicative des écritures
 * gateway. Miroir exact du pattern lib/prospection/ingest.ts
 * (lookupIdempotent/reserveIdempotent/completeIdempotent) sur la table dédiée
 * agent_gateway_idempotency_keys (migration 0043) : un rejeu avec la même clé
 * (tenant, interface, idem_key) ne produit jamais un second effet (§2).
 */
import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type { Json } from "@/lib/supabase/database.types";

export function bodyHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

/**
 * Réponse déjà mémorisée pour (tenant, interface, idemKey) → l'appelant DOIT
 * court-circuiter l'écriture et renvoyer cette réponse. Sinon null.
 */
export async function lookupGatewayIdempotent(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
): Promise<Json | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("agent_gateway_idempotency_keys")
      .select("response, status")
      .eq("tenant_id", tenantId)
      .eq("interface", interfaceName)
      .eq("idem_key", idemKey)
      .maybeSingle();
    if (data && data.status === "completed") return data.response;
    return null;
  } catch {
    return null;
  }
}

/**
 * Pose un verrou `running` (insert atomique sur l'unique tenant/interface/clé).
 * false ⇒ clé déjà réservée (course / rejeu concurrent) → l'appelant NE réécrit
 * PAS une seconde fois.
 */
export async function reserveGatewayIdempotent(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
  bodyHashValue: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return true; // pas de DB → pas de garde possible, l'appelant reste seul juge
  try {
    const { error } = await db.from("agent_gateway_idempotency_keys").insert({
      tenant_id: tenantId,
      interface: interfaceName,
      idem_key: idemKey,
      body_hash: bodyHashValue,
      status: "running",
    });
    if (error) return false; // violation d'unicité (23505) → déjà réservée
    return true;
  } catch {
    return false;
  }
}

/** Mémorise la réponse finale pour rejeu idempotent. Best-effort. */
export async function completeGatewayIdempotent(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
  response: Json,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  try {
    await db
      .from("agent_gateway_idempotency_keys")
      .update({ response, status: "completed" })
      .eq("tenant_id", tenantId)
      .eq("interface", interfaceName)
      .eq("idem_key", idemKey);
  } catch {
    // best-effort
  }
}
