/**
 * lib/agent-gateway/idempotency.ts — idempotence applicative des écritures
 * gateway. Miroir du pattern lib/prospection/ingest.ts sur la table dédiée
 * agent_gateway_idempotency_keys (migration 0044) : un rejeu avec la même clé
 * (tenant, interface, idem_key) ne produit jamais un second effet.
 *
 * Durcissement A2 : on stocke le HASH du payload et on le compare au rejeu. Une
 * même clé réutilisée avec un payload DIFFÉRENT est un CONFLIT (DENIED), pas un
 * rejeu silencieux — sinon un appelant pourrait masquer une écriture divergente
 * derrière une clé déjà vue.
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

export interface IdempotencyRecord {
  status: "running" | "completed" | string;
  bodyHash: string | null;
  response: Json | null;
}

/**
 * Enregistrement existant pour (tenant, interface, idemKey), ou null si aucun.
 * Retourne status + hash + réponse mémorisée — l'appelant décide (rejeu vs conflit).
 */
export async function lookupGatewayRecord(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
): Promise<IdempotencyRecord | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("agent_gateway_idempotency_keys")
      .select("response, status, body_hash")
      .eq("tenant_id", tenantId)
      .eq("interface", interfaceName)
      .eq("idem_key", idemKey)
      .maybeSingle();
    if (!data) return null;
    return {
      status: data.status,
      bodyHash: data.body_hash ?? null,
      response: data.response ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Pose un verrou `running` (insert atomique sur l'unique tenant/interface/clé),
 * en mémorisant le hash du payload. false ⇒ clé déjà réservée (course / rejeu
 * concurrent) → l'appelant NE réécrit PAS une seconde fois.
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

/**
 * Relâche un verrou `running` posé par reserveGatewayIdempotent quand l'écriture
 * n'a produit AUCUN effet (échec transitoire : UNAVAILABLE/DENIED/TIMEOUT). Sans
 * ça, la clé resterait figée `completed` sur un échec et un rejeu LÉGITIME avec la
 * même clé recevrait éternellement l'échec mémorisé — impossible de réessayer.
 *
 * Suppression CONDITIONNÉE à status='running' : jamais une ligne `completed` (un
 * effet réel déjà scellé ne doit jamais être effacé). Best-effort — si le release
 * échoue, la clé reste `running` et un rejeu tombera sur `idempotency_in_progress`
 * (fail-closed : au pire on refuse un rejeu, jamais on ne double un effet).
 */
export async function releaseGatewayIdempotent(
  tenantId: string,
  interfaceName: string,
  idemKey: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  try {
    await db
      .from("agent_gateway_idempotency_keys")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("interface", interfaceName)
      .eq("idem_key", idemKey)
      .eq("status", "running");
  } catch {
    // best-effort
  }
}
