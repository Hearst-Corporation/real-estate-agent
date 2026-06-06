import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePaging(searchParams: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const offsetRaw = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  return { limit, offset };
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const cp = searchParams.get("cp");
  const eligible = searchParams.get("eligible") === "1";
  const { limit, offset } = parsePaging(searchParams);
  const tenantId = tenantOf(claims);

  let q = db
    .from("prosp_annonces")
    .select("id,type_bien,title,prix,surface_m2,nb_pieces,code_postal,commune,source_url,photos_urls,type_annonceur,premiere_parution_at,derniere_republication_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("date_collecte", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cp) q = q.like("code_postal", `${cp}%`);
  // Filtre "éligible mandat" : le scoring vit dans prosp_prospects, pas prosp_annonces.
  // Désactivé tant que le scoring n'est pas rebranché sur ce modèle.
  void eligible;

  const { data, error, count } = await q;
  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "42P01" || code === "42703") {
      return NextResponse.json({ data: [], total: 0, degraded: "prospection_schema_missing" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const items = (data ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    type_bien: a.type_bien,
    titre: a.title,
    prix: a.prix,
    surface: a.surface_m2,
    pieces: a.nb_pieces,
    code_postal: a.code_postal,
    ville: a.commune,
    url: a.source_url,
    photos: a.photos_urls,
    is_pap: String(a.type_annonceur ?? "").toLowerCase() === "pap",
  }));
  return NextResponse.json({ data: items, total: count });
}
