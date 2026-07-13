import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { normalizeVerdict } from "@/lib/prospection/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FeedbackSchema = z
  .object({
    match_id: z.string().uuid(),
    verdict: z.string().min(1),
  })
  .strict();

function parsePaging(searchParams: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const offsetRaw = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  return { limit, offset };
}

type RawAnnonce = Record<string, unknown> | Record<string, unknown>[] | null;
type RawMatch = Record<string, unknown> & { annonce?: RawAnnonce };

function firstAnnonce(annonce: RawAnnonce): Record<string, unknown> | null {
  if (Array.isArray(annonce)) return annonce[0] ?? null;
  return annonce;
}

function mapAnnonce(annonce: RawAnnonce) {
  const a = firstAnnonce(annonce);
  if (!a) return null;
  return {
    id: a.id,
    type_bien: a.type_bien,
    titre: a.titre,
    prix: a.prix,
    surface: a.surface,
    pieces: a.pieces,
    code_postal: a.code_postal,
    ville: a.ville,
    url: a.url,
    is_pap: Boolean(a.is_pap),
  };
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const { searchParams } = new URL(req.url);
  const critereId = searchParams.get("critere_id");
  const { limit, offset } = parsePaging(searchParams);

  let q = db
    .from("prosp_matchs")
    .select("id,score_match,bonus_breakdown,statut,alerted_at,date_match,annonce:prosp_annonces(id,type_bien,titre,prix,surface,pieces,code_postal,ville,url,is_pap)", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .order("score_match", { ascending: false })
    .range(offset, offset + limit - 1);

  if (critereId) q = q.eq("critere_id", critereId);

  const { data, error, count } = await q;
  if (error) {
    console.error("prospection_matchs_fetch_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  const items = ((data ?? []) as RawMatch[]).map((m) => ({
    id: m.id,
    score_match: m.score_match,
    bonus_breakdown: m.bonus_breakdown,
    statut: m.statut,
    alerte_envoyee: Boolean(m.alerted_at),
    alerted_at: m.alerted_at,
    created_at: m.date_match,
    annonce: mapAnnonce(m.annonce ?? null),
  }));
  return NextResponse.json({ data: items, total: count });
}

// POST — feedback
export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const raw = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { match_id, verdict } = parsed.data;

  // La CHECK DB prosp_match_feedback_verdict_check n'accepte que up|down. On mappe
  // 👍→up / 👎→down (+ legacy like/dislike). `contact`/`visite` ne sont PAS du
  // feedback noté : pas de parcours défini → no-op sans écriture DB invalide.
  const dbVerdict = normalizeVerdict(verdict);
  if (dbVerdict === "noop") {
    return NextResponse.json(
      { ok: true, action: "noop", reason: "feedback_not_recorded" },
      { status: 200 },
    );
  }
  if (dbVerdict === null) {
    return NextResponse.json({ error: "verdict invalide" }, { status: 400 });
  }

  const { data: match, error: matchError } = await db
    .from("prosp_matchs")
    .select("id")
    .eq("id", match_id)
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (matchError) {
    console.error("[prospection/matchs] ownership check failed", { code: matchError.code });
    return NextResponse.json({ error: "match_lookup_failed" }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "match_not_found" }, { status: 404 });
  }

  const { error } = await db.from("prosp_match_feedback").insert({
    tenant_id: tenantId,
    user_id:   claims.sub,
    match_id,
    verdict: dbVerdict,
  });
  if (error) {
    console.error("prospection_match_feedback_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "feedback_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
