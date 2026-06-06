import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const critereId = searchParams.get("critere_id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db as any)
    .from("prosp_matchs")
    .select("id,score_match,bonus_breakdown,statut,alerted_at,date_match,annonce:prosp_annonces(id,type_bien,title,prix,surface_m2,nb_pieces,code_postal,commune,source_url,type_annonceur)", { count: "exact" })
    .eq("tenant_id", claims.tenant_id)
    .eq("user_id", claims.sub)
    .order("score_match", { ascending: false })
    .range(offset, offset + limit - 1);

  if (critereId) q = q.eq("critere_id", critereId);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count });
}

// POST — feedback
export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const { match_id, verdict } = body ?? {};
  if (!match_id || !["like","dislike","contact","visite"].includes(verdict)) {
    return NextResponse.json({ error: "match_id + verdict requis" }, { status: 400 });
  }

  const { error } = await db.from("prosp_match_feedback").insert({
    tenant_id: claims.tenant_id,
    user_id:   claims.sub,
    match_id,
    verdict,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
