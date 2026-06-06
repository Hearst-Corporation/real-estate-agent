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
  const cp = searchParams.get("cp");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db as any)
    .from("prosp_annonces")
    .select("id,type_bien,title,prix,surface_m2,nb_pieces,code_postal,commune,source_url,photos_urls,type_annonceur,score_mandat,mandat_eligible,premiere_parution_at,derniere_republication_at", { count: "exact" })
    .eq("tenant_id", claims.tenant_id)
    .order("date_collecte", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cp) q = q.like("code_postal", `${cp}%`);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count });
}
