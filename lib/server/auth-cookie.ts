import type { NextResponse } from "next/server";

const _ttlDays = Number(process.env.AUTH_SESSION_TTL_DAYS);
export const TOKEN_TTL_SECONDS = (_ttlDays > 0 ? _ttlDays : 30) * 86400; // défaut 30 jours
export const TOKEN_COOKIE = "real_estate_agent_token";

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
