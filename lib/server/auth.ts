import { SignJWT, jwtVerify } from "jose";

export type SessionClaims = {
  sub: string;
  email?: string;
  tenant_id: string;
  role: string;
  scope: string[];
  iat?: number;
  exp?: number;
};

function secret(): Uint8Array | null {
  const s = process.env.JWT_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export async function signJwt(
  payload: { sub: string; email?: string; tenant_id: string; role: string; scope: string[] },
  ttlSeconds: number,
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

export async function verifyJwt(token: string | undefined | null): Promise<SessionClaims | null> {
  const key = secret();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.tenant_id !== "string") return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      tenant_id: payload.tenant_id,
      role: typeof payload.role === "string" ? payload.role : "user",
      scope: Array.isArray(payload.scope) ? (payload.scope as string[]) : [],
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
