import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { signJwt } from "@/lib/server/auth";
import { captureServer } from "@/lib/providers/posthog";
import {
  setTokenCookie,
  setMfaPendingCookie,
  TOKEN_TTL_SECONDS,
  MFA_PENDING_TTL_SECONDS,
} from "@/lib/server/auth-cookie";
import { getUserMfa } from "@/lib/server/mfa-store";
import { DEFAULT_TENANT } from "@/lib/tenant";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(req: Request) {
  const body = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb.auth.signInWithPassword({
    email: body.data.email,
    password: body.data.password,
  });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const meta = (data.user.app_metadata ?? {}) as { tenant_id?: string; role?: string };
  const tenant_id = meta.tenant_id ?? DEFAULT_TENANT;
  const role = meta.role ?? "user";
  const scope = role === "admin" ? ["read", "write", "admin"] : ["read", "write"];
  const email = data.user.email ?? undefined;

  const candidate = body.data.next;
  const next = candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";

  // ── 2e facteur MFA — OPT-IN, ZÉRO LOCKOUT ──────────────────────────────────
  // getUserMfa est fail-soft (null si table 0035 absente / erreur DB). On ne pose
  // un 2e facteur QUE si le MFA est explicitement actif. Sinon → flow inchangé.
  const mfa = await getUserMfa(data.user.id);
  if (mfa?.enabled) {
    // On N'ÉMET PAS la session. On pose un cookie PENDING (scope "mfa-pending")
    // que le proxy n'accepte jamais comme session → aucun accès protégé.
    // L'userId est embarqué dans ce token signé → non-forgeable côté verify-login.
    const pending = await signJwt(
      { sub: data.user.id, email, tenant_id, role, scope: ["mfa-pending"] },
      MFA_PENDING_TTL_SECONDS,
    );
    if (!pending) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });
    const res = NextResponse.json({ mfa_required: true });
    setMfaPendingCookie(res, pending, req.headers.get("host"));
    return res; // PAS de setTokenCookie : la session n'est émise qu'après verify-login.
  }

  // ── Flow normal (pas de MFA actif) — strictement inchangé ──────────────────
  const token = await signJwt({ sub: data.user.id, email, tenant_id, role, scope }, TOKEN_TTL_SECONDS);
  if (!token) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });

  captureServer(data.user.id, "login", { role });
  const res = NextResponse.json({ user_id: data.user.id, tenant_id, redirect: next });
  setTokenCookie(res, token, req.headers.get("host"));
  return res;
}
