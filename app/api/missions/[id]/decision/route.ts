import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { submitDecision } from "@/lib/missions/service";
import { tenantOf, uuidOwnerOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── POST /api/missions/[id]/decision — enregistre un choix humain ──────────
// Body : { value: string, decisionId?: string }. Journalise le choix, réinjecte
// la réponse dans le run et repasse la mission en cours.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  let body: { value?: unknown; decisionId?: unknown };
  try {
    body = (await req.json()) as { value?: unknown; decisionId?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const value = typeof body.value === "string" ? body.value : "";
  if (!value) return NextResponse.json({ error: "value_required" }, { status: 400 });
  const decisionId = typeof body.decisionId === "string" ? body.decisionId : undefined;

  const { id } = await params;
  const idn = { userId: claims.sub, tenant: tenantOf(claims), ownerId: uuidOwnerOf(claims) };
  const res = await submitDecision(sb, idn, id, { value, decisionId });
  if ("error" in res) {
    const status = res.error === "not_found" ? 404 : res.error === "no_pending_decision" ? 409 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
