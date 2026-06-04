import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    user_id: claims.sub,
    email: claims.email ?? null,
    tenant_id: claims.tenant_id,
    role: claims.role,
    scope: claims.scope,
    issued_at: claims.iat ?? null,
  });
}
