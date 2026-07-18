// lib/share-tracking/hash.ts — Hachage déterministe (sha-256) PUR.
//
// On ne persiste JAMAIS un token ni une IP en clair : seulement leur hash. Le
// hash est déterministe (même entrée → même sortie) pour permettre une dé-dup
// grossière, mais irréversible (anti-énumération, aucune PII exploitable).
//
// Un sel server-only (SHARE_TRACKING_SALT, repli sur REPORT_SHARING_SECRET) rend
// le hash inutile hors de l'environnement serveur. Fonction pure/testable.

import { createHash } from "node:crypto";

function salt(): string {
  return process.env.SHARE_TRACKING_SALT ?? process.env.REPORT_SHARING_SECRET ?? "";
}

/** sha-256 hex salé d'une valeur. Retourne null si la valeur est vide. */
export function hashValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(`${salt()}:${value}`).digest("hex");
}

/** Hash du token (toujours présent — un event vient toujours d'un token vérifié). */
export function hashToken(token: string): string {
  return createHash("sha256").update(`${salt()}:${token}`).digest("hex");
}
