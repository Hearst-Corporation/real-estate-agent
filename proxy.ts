import { NextResponse, type NextRequest } from "next/server";
import { verifyJwt, signJwt } from "@/lib/server/auth";
import { TOKEN_COOKIE, TOKEN_TTL_SECONDS, setTokenCookie, MFA_PENDING_SCOPE } from "@/lib/server/auth-cookie";
import { DEFAULT_TENANT } from "@/lib/tenant";

// ── Bypass auth DEV ONLY ─────────────────────────────────────────────────────
// NODE_ENV !== "production" (jamais vrai en prod/preview Vercel) ET flag
// explicite requis → aucune activation accidentelle. Pose un JWT admin valide
// à la place de rediriger vers /auth/login, pour zéro friction en local.
const DEV_BYPASS_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
const DEV_BYPASS_USER_ID = process.env.AUTH_DEV_BYPASS_USER_ID || "9717aa27-d844-4221-ab2e-c277b93d77ca";
const DEV_BYPASS_EMAIL = process.env.AUTH_DEV_BYPASS_EMAIL || "admin@real-estate-agent.app";

// Routes publiques (aucune session requise).
const OPEN_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  // 2e étape MFA : s'auto-valide via le cookie PENDING (séparé de TOKEN_COOKIE).
  // Le reste de /api/auth/mfa/* RESTE protégé par session normale.
  "/api/auth/mfa/verify-login",
  "/api/health",
  "/api/inngest", // sécurisé par signature HMAC Inngest (INNGEST_SIGNING_KEY), pas par JWT
  "/api/invest/webhooks", // sécurisé par HMAC, pas JWT
  "/api/swarms/webhook", // sécurisé par HMAC MySwarms, pas JWT
];

function isOpen(pathname: string): boolean {
  if (pathname.startsWith("/auth/")) return true; // /auth/login & co
  if (pathname.startsWith("/brochure/")) return true; // partage signé — token = autorisation
  if (pathname.startsWith("/api/brochure/")) return true; // PDF brochure public signé
  return OPEN_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  // Check révocation GATÉ par env (défaut OFF → pas de coût latence sur chaque
  // requête). Quand activé, fail-open en interne : un blip Supabase laisse passer
  // plutôt que de verrouiller tous les users. Tokens legacy sans jti = ignorés.
  const claims = await verifyJwt(token, {
    checkRevocation: process.env.AUTH_CHECK_REVOCATION === "true",
  });
  // Un token de scope "mfa-pending" est valide cryptographiquement mais N'AUTHENTIFIE
  // PAS (2e facteur non encore fourni) : on le traite comme non connecté dans toute
  // la logique de gate. verifyJwt ne valide pas le scope, le rejet se fait ici.
  const authed = !!claims && !claims.scope?.includes(MFA_PENDING_SCOPE);

  // Connecté + sur /auth/login → renvoyer au dashboard.
  if (authed && pathname.startsWith("/auth/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isOpen(pathname)) return NextResponse.next();

  // Bypass DEV ONLY : non connecté + AUTH_DEV_BYPASS=true en local → pose un
  // JWT admin directement au lieu de rediriger vers /auth/login.
  if (!authed && DEV_BYPASS_ENABLED) {
    const devToken = await signJwt(
      { sub: DEV_BYPASS_USER_ID, email: DEV_BYPASS_EMAIL, tenant_id: DEFAULT_TENANT, role: "admin", scope: [] },
      TOKEN_TTL_SECONDS,
    );
    if (devToken) {
      const res = NextResponse.next();
      setTokenCookie(res, devToken, request.headers.get("host"));
      return res;
    }
  }

  // Non connecté + route API → 401 JSON (jamais une redirection HTML).
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Connecté → sliding session : re-pose le cookie avec maxAge complet.
  const res = NextResponse.next();
  if (token) setTokenCookie(res, token, request.headers.get("host"));
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json|woff2?)$).*)"],
};
