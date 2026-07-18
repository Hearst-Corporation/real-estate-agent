/**
 * lib/offmarket/share.ts — Token de partage signé (jose HS256) pour une
 * sélection off-market.
 *
 * Même patron que `lib/estimation/share.ts` : JWT opaque, secret côté serveur,
 * payload minimal { sid, exp }. Le token référence l'`id` de la sélection ;
 * l'accès public (page + POST feedback) est borné à cette sélection, sans
 * énumération possible (id UUID + signature vérifiée).
 *
 * Secret  : process.env.OFFMARKET_SHARING_SECRET, repli sur REPORT_SHARING_SECRET.
 * Payload : { sid: string, exp: number }
 *
 * signSelectionToken(id, ttlSeconds?)  → string  (JWT opaque)
 * verifySelectionToken(token)          → { selectionId } | null
 */

import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256" as const;

/** TTL par défaut d'un lien de sélection : 30 jours. */
export const OFFMARKET_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function sharingSecret(): Uint8Array | null {
  const s = process.env.OFFMARKET_SHARING_SECRET ?? process.env.REPORT_SHARING_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

/**
 * Signe un token de partage pour une sélection.
 * Throw si aucun secret n'est configuré (l'appelant renvoie 503).
 */
export async function signSelectionToken(
  selectionId: string,
  ttlSeconds = OFFMARKET_TOKEN_TTL_SECONDS,
): Promise<string> {
  const key = sharingSecret();
  if (!key) throw new Error("OFFMARKET_SHARING_SECRET/REPORT_SHARING_SECRET is not set");

  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ sid: selectionId })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Vérifie un token de partage.
 * Renvoie null si invalide, expiré ou si le secret n'est pas configuré.
 */
export async function verifySelectionToken(
  token: string,
): Promise<{ selectionId: string } | null> {
  const key = sharingSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (typeof payload.sid !== "string") return null;
    return { selectionId: payload.sid };
  } catch {
    return null;
  }
}
