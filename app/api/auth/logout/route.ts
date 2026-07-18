import { NextResponse } from "next/server";
import type { Gpu1Client } from "@/lib/gpu1";
import { verifyJwt } from "@/lib/server/auth";
import { getGpu1Admin } from "@/lib/gpu1";
import { TOKEN_COOKIE, clearTokenCookie } from "@/lib/server/auth-cookie";
import { recordAuthEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Révocation best-effort : on enregistre le jti du token courant pour qu'il
  // soit rejeté par le check révocation (gaté). Ne JAMAIS faire échouer le
  // logout : toute erreur ici est avalée, le cookie est effacé dans tous les cas.
  let logoutUserId: string | null = null;
  try {
    const cookie = req.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(TOKEN_COOKIE + "="))
      ?.slice(TOKEN_COOKIE.length + 1);

    if (token) {
      const claims = await verifyJwt(token);
      logoutUserId = claims?.sub ?? null;
      if (claims?.jti) {
        // `revoked_sessions` pas encore dans les types générés (migration 0028
        // non appliquée) → client non typé pour cet INSERT best-effort.
        const sb = getGpu1Admin() as Gpu1Client | null;
        if (sb) {
          await sb.from("revoked_sessions").upsert(
            {
              jti: claims.jti,
              user_id: claims.sub,
              token_iat: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
            },
            { onConflict: "jti", ignoreDuplicates: true },
          );
        }
      }
    }
  } catch {
    // best-effort : on ne bloque jamais la déconnexion sur un échec de révocation.
  }

  await recordAuthEvent({ event: "logout", req, userId: logoutUserId });
  const res = NextResponse.json({ ok: true });
  clearTokenCookie(res, req.headers.get("host"));
  return res;
}
