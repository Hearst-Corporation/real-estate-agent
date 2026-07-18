/**
 * GET /api/admin — vue d'oversight admin (providers + volumétrie), lecture seule.
 * - 401 non authentifié · 403 si role !== 'admin' · 503 si Supabase absent (dégradé)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { buildAdminOverview } from "@/lib/admin/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = getGpu1Admin();
  const overview = await buildAdminOverview(sb, claims.tenant_id);
  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
