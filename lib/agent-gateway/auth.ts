/**
 * lib/agent-gateway/auth.ts — auth service-to-service pour la gateway agents.
 *
 * Distinct de la session JWT jose utilisateur (lib/server/auth.ts) : les agents
 * Aigent n'ont jamais de cookie navigateur, ils portent un Bearer token dédié
 * (AGENT_GATEWAY_TOKEN) sur chaque appel. Comparaison en temps constant pour
 * éviter un timing attack sur le token. Fail-closed : token absent/invalide/non
 * configuré → DENIED avant tout accès DB, jamais un accès par défaut.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";

export type GatewayAuthResult =
  | { ok: true }
  | { ok: false; reason: "token_missing" | "token_invalid" | "not_configured" };

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Extrait le Bearer token du header Authorization. */
function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Vérifie le token service-to-service AVANT tout accès DB (fail-closed).
 * Retourne { ok: true } uniquement si AGENT_GATEWAY_TOKEN est configuré ET que
 * le Bearer fourni correspond exactement.
 */
export function checkGatewayAuth(req: Request): GatewayAuthResult {
  const expected = process.env.AGENT_GATEWAY_TOKEN;
  if (!expected || expected.length === 0) {
    return { ok: false, reason: "not_configured" };
  }
  const provided = bearerFrom(req);
  if (!provided) {
    return { ok: false, reason: "token_missing" };
  }
  if (!constantTimeEquals(provided, expected)) {
    return { ok: false, reason: "token_invalid" };
  }
  return { ok: true };
}
