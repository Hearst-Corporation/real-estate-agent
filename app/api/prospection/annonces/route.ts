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
    .select("id,type_bien,titre,prix,surface,pieces,code_postal,ville,url,photos,is_pap,date_publication,republication", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
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
    console.error("prospection_annonces_fetch_failed", { tenantId, error: error.message });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  const items = (data ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    type_bien: a.type_bien,
    titre: a.titre,
    prix: a.prix,
    surface: a.surface,
    pieces: a.pieces,
    code_postal: a.code_postal,
    ville: a.ville,
    url: a.url,
    photos: a.photos,
    is_pap: Boolean(a.is_pap),
  }));
  return NextResponse.json({ data: items, total: count });
}
