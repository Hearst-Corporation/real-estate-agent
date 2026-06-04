import { NextResponse, type NextRequest } from "next/server";
import { verifyJwt } from "@/lib/server/auth";
import { TOKEN_COOKIE, setTokenCookie } from "@/lib/server/auth-cookie";

// Routes publiques (aucune session requise).
const OPEN_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
];

function isOpen(pathname: string): boolean {
  if (pathname.startsWith("/auth/")) return true; // /auth/login & co
  return OPEN_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const claims = await verifyJwt(token);

  // Connecté + sur /auth/login → renvoyer au dashboard.
  if (claims && pathname.startsWith("/auth/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isOpen(pathname)) return NextResponse.next();

  // Non connecté + route API → 401 JSON (jamais une redirection HTML).
  if (!claims) {
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
