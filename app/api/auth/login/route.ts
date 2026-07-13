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
import { recordAuthEvent } from "@/lib/server/audit-log";

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

  // Auth locale (self-hosté gpu1) : GoTrue n'est pas repris par le montage
  // PostgREST → on vérifie le password via la RPC `verify_login` (bcrypt/pgcrypto,
  // migration 0037). Bon password → 1 ligne {user_id, tenant_id, role} ; sinon [].
  const { data: rows, error } = await sb.rpc("verify_login", {
    p_email: body.data.email,
    p_password: body.data.password,
  });
  const cred = Array.isArray(rows) ? rows[0] : null;
  if (error || !cred) {
    await recordAuthEvent({ event: "login_failed", req, userId: null, meta: { email: body.data.email } });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const user = { id: cred.user_id, email: body.data.email };
  const tenant_id = cred.tenant_id ?? DEFAULT_TENANT;
  const role = cred.role ?? "user";
  const scope = role === "admin" ? ["read", "write", "admin"] : ["read", "write"];
  const email = user.email ?? undefined;

  const candidate = body.data.next;
  const next = candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";

  // ── 2e facteur MFA — OPT-IN, ZÉRO LOCKOUT ──────────────────────────────────
  // getUserMfa est fail-soft (null si table 0035 absente / erreur DB). On ne pose
  // un 2e facteur QUE si le MFA est explicitement actif. Sinon → flow inchangé.
  const mfa = await getUserMfa(user.id);
  if (mfa?.enabled) {
    // On N'ÉMET PAS la session. On pose un cookie PENDING (scope "mfa-pending")
    // que le proxy n'accepte jamais comme session → aucun accès protégé.
    // L'userId est embarqué dans ce token signé → non-forgeable côté verify-login.
    const pending = await signJwt(
      { sub: user.id, email, tenant_id, role, scope: ["mfa-pending"] },
      MFA_PENDING_TTL_SECONDS,
    );
    if (!pending) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });
    await recordAuthEvent({ event: "login_pending_mfa", req, userId: user.id });
    const res = NextResponse.json({ mfa_required: true });
    setMfaPendingCookie(res, pending, req.headers.get("host"));
    return res; // PAS de setTokenCookie : la session n'est émise qu'après verify-login.
  }

  // ── Flow normal (pas de MFA actif) — strictement inchangé ──────────────────
  const token = await signJwt({ sub: user.id, email, tenant_id, role, scope }, TOKEN_TTL_SECONDS);
  if (!token) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });

  captureServer(user.id, "login", { role });
  await recordAuthEvent({ event: "login", req, userId: user.id });
  const res = NextResponse.json({ user_id: user.id, tenant_id, redirect: next });
  setTokenCookie(res, token, req.headers.get("host"));
  return res;
}
