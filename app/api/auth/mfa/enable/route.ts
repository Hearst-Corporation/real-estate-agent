import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { verifyTotp, generateBackupCodes, hashBackupCode } from "@/lib/server/mfa";
import { getUserMfa, enableMfa } from "@/lib/server/mfa-store";
import { rateLimit } from "@/lib/ratelimit";
import { recordAuthEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anti-brute-force du code TOTP à confirmer : 5 tentatives / 60 s par utilisateur.
const ENABLE_RATE_LIMIT = 5;
const ENABLE_RATE_WINDOW_S = 60;

/**
 * POST /api/auth/mfa/enable  body: { code: string }
 * Confirme l'enrôlement : vérifie un 1er code TOTP contre le secret en attente, active le MFA,
 * génère les codes de secours et les renvoie EN CLAIR (montrés une seule fois — la DB ne stocke
 * que leurs hashes).
 */
export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const allowed = await rateLimit(`mfa:enable:${claims.sub}`, ENABLE_RATE_LIMIT, ENABLE_RATE_WINDOW_S);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const mfa = await getUserMfa(claims.sub);
  // Pas de secret en attente (setup jamais fait) ou table 0035 absente → impossible d'activer.
  if (!mfa) return NextResponse.json({ error: "mfa_unavailable" }, { status: 503 });

  if (!verifyTotp(mfa.secret, code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const codes = generateBackupCodes();
  const hashes = codes.map(hashBackupCode);
  const saved = await enableMfa(claims.sub, hashes);
  if (!saved) return NextResponse.json({ error: "mfa_unavailable" }, { status: 503 });

  // backupCodes en CLAIR : unique occurrence où ils sortent du serveur.
  await recordAuthEvent({ event: "mfa_enabled", req, userId: claims.sub });
  return NextResponse.json({ enabled: true, backupCodes: codes });
}
