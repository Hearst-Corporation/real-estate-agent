import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { signJwt } from "@/lib/server/auth";
import { captureServer } from "@/lib/providers/posthog";
import { setTokenCookie, TOKEN_TTL_SECONDS } from "@/lib/server/auth-cookie";
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

  const token = await signJwt(
    { sub: data.user.id, email: data.user.email ?? undefined, tenant_id, role, scope },
    TOKEN_TTL_SECONDS,
  );
  if (!token) return NextResponse.json({ error: "jwt_not_configured" }, { status: 503 });

  const candidate = body.data.next;
  const next = candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";

  captureServer(data.user.id, "login", { role });
  const res = NextResponse.json({ user_id: data.user.id, tenant_id, redirect: next });
  setTokenCookie(res, token, req.headers.get("host"));
  return res;
}
