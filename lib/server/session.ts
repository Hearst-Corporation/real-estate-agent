import { cookies } from "next/headers";
import { verifyJwt, type SessionClaims } from "@/lib/server/auth";
import { TOKEN_COOKIE } from "@/lib/server/auth-cookie";

/** Lit + vérifie la session depuis le cookie (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  return verifyJwt(token);
}
