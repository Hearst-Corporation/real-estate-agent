import type { NextResponse } from "next/server";

const _ttlDays = Number(process.env.AUTH_SESSION_TTL_DAYS);
export const TOKEN_TTL_SECONDS = (_ttlDays > 0 ? _ttlDays : 30) * 86400; // défaut 30 jours
export const TOKEN_COOKIE = "real_estate_agent_token";

// Cookie PENDING (2e facteur MFA) — SÉPARÉ du cookie session. Il porte un token
// de scope "mfa-pending" qui n'ouvre AUCUNE route protégée (le proxy lit
// uniquement TOKEN_COOKIE). Durée de vie courte : on a juste le temps de saisir
// le code TOTP / un code de secours après le mot de passe.
export const MFA_PENDING_COOKIE = "real_estate_agent_mfa_pending";
export const MFA_PENDING_TTL_SECONDS = 5 * 60; // 5 min

/**
 * Scope porté par les tokens MFA "pending" (1er facteur OK, 2e facteur pas encore validé).
 * Source de vérité unique : importée par proxy.ts, session.ts et verify-login/route.ts.
 */
export const MFA_PENDING_SCOPE = "mfa-pending";

function cookieDomain(host: string | null | undefined): string | undefined {
  if (process.env.NODE_ENV !== "production") return undefined;
  if (!host) return undefined;
  if (host.endsWith(".vercel.app")) return undefined; // previews : host courant only
  if (host.endsWith(".hearst.app") || host === "hearst.app") return ".hearst.app"; // SSO cross-satellites
  return undefined;
}

export function setTokenCookie(res: NextResponse, token: string, host: string | null | undefined): void {
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
    ...(cookieDomain(host) ? { domain: cookieDomain(host) } : {}),
  });
}

export function clearTokenCookie(res: NextResponse, host: string | null | undefined): void {
  res.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(cookieDomain(host) ? { domain: cookieDomain(host) } : {}),
  });
}

// MÊMES options que setTokenCookie (httpOnly, secure, sameSite lax, path /, domaine)
// — seule différence : maxAge court (MFA_PENDING_TTL_SECONDS) pour le cookie pending.
export function setMfaPendingCookie(res: NextResponse, token: string, host: string | null | undefined): void {
  res.cookies.set(MFA_PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_PENDING_TTL_SECONDS,
    ...(cookieDomain(host) ? { domain: cookieDomain(host) } : {}),
  });
}

export function clearMfaPendingCookie(res: NextResponse, host: string | null | undefined): void {
  res.cookies.set(MFA_PENDING_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(cookieDomain(host) ? { domain: cookieDomain(host) } : {}),
  });
}
