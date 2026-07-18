import { SignJWT, jwtVerify } from "jose";
import type { Gpu1Client } from "@/lib/gpu1";
import { getGpu1Admin } from "@/lib/gpu1";
import { captureFatal } from "@/lib/server/observe";

// Throttle captureFatal pour le check de révocation : en prod, ce code tourne
// à chaque requête authentifiée. Si la base a un incident, émettre un event
// Sentry par requête déclencherait un flood + surcoût. On limite à 1 event/60s.
let _lastRevocationCapture = 0;
const REVOCATION_CAPTURE_THROTTLE_MS = 60_000;

export type SessionClaims = {
  sub: string;
  email?: string;
  tenant_id: string;
  role: string;
  scope: string[];
  jti?: string; // identifiant de token (révocation). Absent sur les tokens legacy → check sauté.
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
  // jti unique par token → permet la révocation ciblée (logout / kill admin).
  const jti = crypto.randomUUID();
  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

export async function verifyJwt(
  token: string | undefined | null,
  opts?: { checkRevocation?: boolean },
): Promise<SessionClaims | null> {
  const key = secret();
  if (!key || !token) return null;
  let claims: SessionClaims;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.tenant_id !== "string") return null;
    claims = {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      tenant_id: payload.tenant_id,
      role: typeof payload.role === "string" ? payload.role : "user",
      scope: Array.isArray(payload.scope) ? (payload.scope as string[]) : [],
      jti: typeof payload.jti === "string" ? payload.jti : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }

  // Check révocation : seulement si demandé ET si le token porte un jti.
  // Tokens legacy (sans jti) → check sauté → restent acceptés (rétro-compat).
  // FAIL-OPEN : toute erreur de lookup (réseau / base non configurée) laisse
  // passer le token — un blip DB ne doit jamais verrouiller tous les users.
  if (opts?.checkRevocation && claims.jti) {
    try {
      // `revoked_sessions` n'est pas (encore) dans les types générés tant que la
      // migration 0028 n'est pas appliquée → client non typé pour cette requête.
      const sb = getGpu1Admin() as Gpu1Client | null;
      if (sb) {
        const { data, error } = await sb
          .from("revoked_sessions")
          .select("jti")
          .eq("jti", claims.jti)
          .maybeSingle();
        if (!error && data) return null; // jti révoqué → session invalide
      }
    } catch (err) {
      // fail-open : un blip DB ne doit jamais verrouiller les users.
      // Throttle anti-flood : on n'émet qu'un event Sentry toutes les 60s
      // pour éviter de saturer le quota sur un incident DB en prod.
      const now = Date.now();
      if (now - _lastRevocationCapture > REVOCATION_CAPTURE_THROTTLE_MS) {
        _lastRevocationCapture = now;
        captureFatal(err, "auth/revocation-check");
      }
    }
  }

  return claims;
}
