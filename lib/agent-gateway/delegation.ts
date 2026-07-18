/**
 * lib/agent-gateway/delegation.ts — délégation d'acteur SIGNÉE (HMAC).
 *
 * Un acteur non présent dans `users` (job autonome, acteur système) ne peut PAS
 * agir librement. La seule voie est une DÉLÉGATION EXPLICITE signée par un secret
 * serveur (`AGENT_GATEWAY_DELEGATION_SECRET`), liant (tenant, agent, acteur) à une
 * échéance. Le payload porte la revendication + la signature ; on la revérifie ici
 * en temps constant, fail-closed :
 *
 *   - secret non configuré → aucune délégation acceptée (DENIED).
 *   - signature invalide / expirée / ne correspondant pas au contexte → DENIED.
 *   - aucune auto-délégation : la signature vient d'un secret serveur, pas du
 *     payload lui-même ; un appelant ne peut pas la forger sans le secret.
 *
 * Le secret n'est jamais loggé ni renvoyé. La signature est un HMAC-SHA256 du
 * message canonique `v1|tenant|agent|actor|expires_at`.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface DelegationClaim {
  actor_user_id: string; // sujet délégué (peut être "system" ou un UUID)
  tenant_id: string;
  agent_id: string;
  expires_at: string; // ISO 8601
  signature: string; // hex HMAC-SHA256
}

export type DelegationResult =
  | { ok: true; actorUserId: string }
  | { ok: false; reason: string };

interface DelegationContext {
  tenantId: string;
  agentId: string;
  actorUserId: string;
}

/** Message canonique signé — ordre figé, versionné (`v1`). */
function canonicalMessage(claim: {
  tenant_id: string;
  agent_id: string;
  actor_user_id: string;
  expires_at: string;
}): string {
  return ["v1", claim.tenant_id, claim.agent_id, claim.actor_user_id, claim.expires_at].join("|");
}

/** HMAC-SHA256 hex du message avec le secret serveur. */
export function signDelegation(
  secret: string,
  claim: { tenant_id: string; agent_id: string; actor_user_id: string; expires_at: string },
): string {
  return createHmac("sha256", secret).update(canonicalMessage(claim)).digest("hex");
}

function constantTimeHexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "hex");
    bufB = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Vérifie une délégation contre le contexte d'appel (tenant/agent/acteur dérivés
 * du token + payload validé). Fail-closed : tout écart → DENIED.
 */
export function verifyDelegation(
  claim: DelegationClaim,
  ctx: DelegationContext,
): DelegationResult {
  const secret = process.env.AGENT_GATEWAY_DELEGATION_SECRET;
  if (!secret || secret.length === 0) {
    return { ok: false, reason: "delegation_not_configured" };
  }

  // Le sujet/tenant/agent de la revendication doivent coller au contexte d'appel :
  // pas de délégation "portable" vers un autre tenant/agent/acteur.
  if (claim.tenant_id !== ctx.tenantId) return { ok: false, reason: "delegation_tenant_mismatch" };
  if (claim.agent_id !== ctx.agentId) return { ok: false, reason: "delegation_agent_mismatch" };
  if (claim.actor_user_id !== ctx.actorUserId) {
    return { ok: false, reason: "delegation_actor_mismatch" };
  }

  const expiresAt = Date.parse(claim.expires_at);
  if (Number.isNaN(expiresAt)) return { ok: false, reason: "delegation_bad_expiry" };
  if (expiresAt <= Date.now()) return { ok: false, reason: "delegation_expired" };

  const expected = signDelegation(secret, {
    tenant_id: claim.tenant_id,
    agent_id: claim.agent_id,
    actor_user_id: claim.actor_user_id,
    expires_at: claim.expires_at,
  });
  if (!constantTimeHexEquals(claim.signature, expected)) {
    return { ok: false, reason: "delegation_bad_signature" };
  }

  return { ok: true, actorUserId: claim.actor_user_id };
}
