import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signJwt, verifyJwt } from "@/lib/server/auth";
import { verifyTotp, verifyAndConsumeBackupCode } from "@/lib/server/mfa";
import { getUserMfa, updateBackupCodes } from "@/lib/server/mfa-store";
import {
  MFA_PENDING_COOKIE,
  TOKEN_TTL_SECONDS,
  MFA_PENDING_SCOPE,
  setTokenCookie,
  clearMfaPendingCookie,
} from "@/lib/server/auth-cookie";
import { rateLimit } from "@/lib/ratelimit";
import { recordAuthEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anti-brute-force du 2e facteur au login, par IP : 10 tentatives / 60 s.
const VERIFY_LOGIN_RATE_LIMIT = 10;
const VERIFY_LOGIN_RATE_WINDOW_S = 60;

// 2e barrière par utilisateur (sub), une fois le token pending décodé : 5 tentatives / 60 s.
// Empêche un pool d'IP (botnet) de contourner la limite par-IP en ciblant un même compte.
const VERIFY_LOGIN_SUB_RATE_LIMIT = 5;
const VERIFY_LOGIN_SUB_RATE_WINDOW_S = 60;

/** Première IP de la chaîne x-forwarded-for, ou null. */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

/** Valide un chemin de redirection interne (interdit les URLs absolues / protocol-relative). */
function safeNext(candidate: unknown): string {
  return typeof candidate === "string" && candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/";
}

/**
 * POST /api/auth/mfa/verify-login  body: { code: string, next?: string }
 *
 * 2e étape du login quand le MFA est actif. Le 1er facteur (mot de passe) a posé un cookie
 * PENDING (scope "mfa-pending") SANS session. Ici on vérifie le code TOTP / code de secours,
 * puis on émet la VRAIE session et on efface le cookie pending.
 *
 * Route OUVERTE dans proxy.ts (elle s'auto-valide via le cookie pending) — mais le pending
 * n'ouvre AUCUNE autre route : le proxy ne lit que TOKEN_COOKIE.
 */
export async function POST(req: Request) {
  // 1) Rate-limit (IP, ou "noip" si absente — pré-décodage, donc clé sur IP).
  const ip = clientIp(req) ?? "noip";
  const allowed = await rateLimit(`mfa:verifylogin:${ip}`, VERIFY_LOGIN_RATE_LIMIT, VERIFY_LOGIN_RATE_WINDOW_S);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // 2) Lis + vérifie le cookie PENDING.
  const store = await cookies();
  const pending = store.get(MFA_PENDING_COOKIE)?.value;
  const claims = await verifyJwt(pending);
  if (!claims) return NextResponse.json({ error: "mfa_pending_expired" }, { status: 401 });
  // Doit être un token pending — pas une session normale réinjectée par erreur.
  if (!claims.scope.includes(MFA_PENDING_SCOPE)) {
    return NextResponse.json({ error: "mfa_pending_expired" }, { status: 401 });
  }

  // 3) userId VIENT DU TOKEN SIGNÉ (jamais du body → non-forgeable).
  const userId = claims.sub;

  // 3b) 2e rate-limit PAR USER (sub) — maintenant que le pending est décodé.
  // La limite IP seule est contournable par un botnet ; celle-ci plafonne les tentatives
  // par compte ciblé, indépendamment du nombre d'IP sources.
  const allowedSub = await rateLimit(
    `mfa:verifylogin:sub:${userId}`,
    VERIFY_LOGIN_SUB_RATE_LIMIT,
    VERIFY_LOGIN_SUB_RATE_WINDOW_S,
  );
  if (!allowedSub) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const mfa = await getUserMfa(userId);
  if (!mfa || !mfa.enabled) {
    // État incohérent (MFA désactivé entre les deux étapes, ou table indisponible).
    return NextResponse.json({ error: "mfa_pending_expired" }, { status: 401 });
  }

  // 4) Vérifie le code : TOTP courant OU code de secours (consommé une seule fois).
  const body = (await req.json().catch(() => null)) as { code?: unknown; next?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 401 });

  // TOTP ne consomme rien → s'il valide, on émet la session directement.
  let verified = verifyTotp(mfa.secret, code);
  if (!verified) {
    const consumed = verifyAndConsumeBackupCode(code, mfa.backup_codes);
    if (consumed.ok) {
      // FAIL-CLOSED : un code de secours est à usage unique. On DOIT le retirer de la DB
      // AVANT d'émettre la session, sinon une panne DB partielle (select OK / update KO)
      // le laisserait rejouable. Si l'update échoue → pas de session, le user retente.
      const persisted = await updateBackupCodes(userId, consumed.remaining);
      if (!persisted) {
        return NextResponse.json({ error: "mfa_consume_failed" }, { status: 503 });
      }
      verified = true;
    }
  }
  if (!verified) {
    await recordAuthEvent({ event: "login_mfa_failed", req, userId });
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  // 5) Succès : recompute le scope depuis le rôle, émet la VRAIE session, efface le pending.
  const scope = claims.role === "admin" ? ["read", "write", "admin"] : ["read", "write"];
  const token = await signJwt(
    { sub: userId, email: claims.email, tenant_id: claims.tenant_id, role: claims.role, scope },
    TOKEN_TTL_SECONDS,
  );
  if (!token) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });

  const next = safeNext(body?.next);
  await recordAuthEvent({ event: "login_mfa", req, userId });
  const res = NextResponse.json({ user_id: userId, tenant_id: claims.tenant_id, redirect: next });
  setTokenCookie(res, token, req.headers.get("host"));
  clearMfaPendingCookie(res, req.headers.get("host"));
  return res;
}
