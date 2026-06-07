import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getMissionState } from "@/lib/missions/service";
import { tenantOf, uuidOwnerOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/missions/[id] — état traduit de la mission (pollé par la page) ──
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;
  const idn = { userId: claims.sub, tenant: tenantOf(claims), ownerId: uuidOwnerOf(claims) };
  const view = await getMissionState(sb, idn, id);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ view });
}
