/**
 * lib/estimation/share.ts — Token de partage signé (jose HS256).
 *
 * Secret  : process.env.REPORT_SHARING_SECRET
 * Payload : { eid: string, exp: number }
 *
 * signShareToken(id, ttlSeconds?)   → string  (JWT opaque)
 * verifyShareToken(token)            → { estimationId } | null
 */

import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256" as const;

function sharingSecret(): Uint8Array | null {
  const s = process.env.REPORT_SHARING_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

/**
 * Signe un token de partage pour une estimation.
 * TTL par défaut : 30 jours.
 * Throw si REPORT_SHARING_SECRET n'est pas défini.
 */
export async function signShareToken(
  estimationId: string,
  ttlSeconds = 60 * 60 * 24 * 30
): Promise<string> {
  const key = sharingSecret();
  if (!key) throw new Error("REPORT_SHARING_SECRET is not set");

  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ eid: estimationId })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Vérifie un token de partage.
 * Renvoie null si invalide, expiré ou si le secret n'est pas configuré.
 */
export async function verifyShareToken(
  token: string
): Promise<{ estimationId: string } | null> {
  const key = sharingSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (typeof payload.eid !== "string") return null;
    return { estimationId: payload.eid };
  } catch {
    return null;
  }
}
