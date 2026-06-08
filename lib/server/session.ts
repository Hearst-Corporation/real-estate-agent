import { cookies } from "next/headers";
import { verifyJwt, type SessionClaims } from "@/lib/server/auth";
import { TOKEN_COOKIE, MFA_PENDING_SCOPE } from "@/lib/server/auth-cookie";

/** Lit + vérifie la session depuis le cookie (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  const claims = await verifyJwt(token);
  // Un token de scope "mfa-pending" n'ouvre aucune session, même s'il atterrissait
  // dans TOKEN_COOKIE : verifyJwt ne valide pas le scope, on le rejette au point de
  // consommation.
  if (claims?.scope?.includes(MFA_PENDING_SCOPE)) return null;
  return claims;
}
