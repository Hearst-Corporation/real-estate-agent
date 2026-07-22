import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { verifyTotp, verifyAndConsumeBackupCode } from "@/lib/server/mfa";
import { getUserMfa, disableMfa } from "@/lib/server/mfa-store";
import { rateLimit } from "@/lib/ratelimit";
import { recordAuthEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anti-brute-force du code de désactivation : 5 tentatives / 60 s par utilisateur.
const DISABLE_RATE_LIMIT = 5;
const DISABLE_RATE_WINDOW_S = 60;

/**
 * POST /api/auth/mfa/disable  body: { code: string }
 * Désactive le MFA. Exige un code valide — TOTP OU code de secours — pour éviter qu'une
 * session volée puisse retirer le 2FA sans facteur. Idempotent : si le MFA n'est pas actif,
 * renvoie `{ enabled:false }` sans erreur.
 */
export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const allowed = await rateLimit(`mfa:disable:${claims.sub}`, DISABLE_RATE_LIMIT, DISABLE_RATE_WINDOW_S);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const mfa = await getUserMfa(claims.sub);
  // Pas de MFA actif (ou table absente) → rien à désactiver, réponse idempotente.
  if (!mfa?.enabled) return NextResponse.json({ enabled: false });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  // Accepte un code TOTP courant OU un code de secours valide.
  const totpOk = verifyTotp(mfa.secret, code);
  const backupOk = totpOk ? false : verifyAndConsumeBackupCode(code, mfa.backup_codes).ok;
  if (!totpOk && !backupOk) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const ok = await disableMfa(claims.sub);
  if (!ok) return NextResponse.json({ error: "mfa_unavailable" }, { status: 503 });

  await recordAuthEvent({ event: "mfa_disabled", req, userId: claims.sub });
  return NextResponse.json({ enabled: false });
}
