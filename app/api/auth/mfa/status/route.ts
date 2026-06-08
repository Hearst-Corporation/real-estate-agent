import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getUserMfa } from "@/lib/server/mfa-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/mfa/status
 * Indique si le MFA est actif pour l'utilisateur courant.
 * Fail-soft : aucune ligne / table absente / erreur → `getUserMfa` renvoie null → `enabled:false`.
 */
export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const mfa = await getUserMfa(claims.sub);
  return NextResponse.json({ enabled: Boolean(mfa?.enabled) });
}
