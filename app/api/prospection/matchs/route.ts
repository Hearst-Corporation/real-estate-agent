import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { normalizeSignal } from "@/lib/prospection/feedback";
import { buildExplanation } from "@/lib/prospection/explain";
import { recoFromScore } from "@/app/(dashboard)/prospection/_components/reco";
import type { TablesInsert } from "@/lib/supabase/database.types";

// database.types.ts est désynchronisé du schéma gpu1 : la table
// prosp_match_feedback a la colonne `signal` (pas `verdict`).
type FeedbackInsert = TablesInsert<"prosp_match_feedback">;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FeedbackSchema = z
  .object({
    match_id: z.string().uuid(),
    // Historiquement `verdict` ; on accepte aussi `signal`. La valeur est
    // normalisée vers ce que la CHECK DB accepte (like|dislike|contact|visite).
    verdict: z.string().min(1).optional(),
    signal: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.verdict || v.signal), { message: "signal_required" });

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
    dpe_note: a.dpe ?? null,
    photos_urls: Array.isArray(a.photos) ? (a.photos as string[]) : [],
    url: a.url,
    is_pap: Boolean(a.is_pap),
    lead_id: a.lead_id ?? null,
    property_id: a.property_id ?? null,
    estimation_id: a.estimation_id ?? null,
    demarchage_bloque: a.demarchage_bloque ?? null,
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
    .select(
      "id,critere_id,score_match,score_breakdown,features_snapshot,engine_version,alerte_envoyee,alerte_at,created_at,annonce:prosp_annonces(id,type_bien,titre,prix,surface,pieces,code_postal,ville,dpe,photos,url,is_pap,lead_id,property_id,estimation_id,demarchage_bloque)",
      { count: "exact" },
    )
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
  const items = ((data ?? []) as RawMatch[]).map((m) => {
    const breakdown = (m.score_breakdown ?? null) as Record<string, number> | null;
    const features = (m.features_snapshot ?? null) as Record<string, unknown> | null;
    const score = Number(m.score_match) || 0;
    // Explication HONNÊTE dérivée du breakdown + features réels persistés
    // (aucune raison inventée). La recommandation dérive du score via les seuils
    // partagés (source unique RECOMMENDATION_THRESHOLDS).
    const explanation = buildExplanation(breakdown, features, score);
    return {
      id: m.id,
      critere_id: m.critere_id,
      score_match: m.score_match,
      score_breakdown: breakdown,
      features_snapshot: features,
      engine_version: m.engine_version,
      alerte_envoyee: Boolean(m.alerte_envoyee),
      alerte_at: m.alerte_at,
      created_at: m.created_at,
      recommandation: recoFromScore(score),
      explanation,
      annonce: mapAnnonce(m.annonce ?? null),
    };
  });
  return NextResponse.json({ data: items, total: count });
}

// POST — feedback (signal sur un match)
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
  const { match_id } = parsed.data;

  // La CHECK DB prosp_match_feedback_signal_check n'accepte que
  // like|dislike|contact|visite. On mappe 👍→like / 👎→dislike (+ legacy up/down).
  const signal = normalizeSignal(parsed.data.signal ?? parsed.data.verdict);
  if (signal === null) {
    return NextResponse.json({ error: "signal invalide" }, { status: 400 });
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

  // Le schéma réel gpu1 a la colonne `signal` (les types générés déclarent
  // `verdict`) → cast via unknown, cf. routes voisines (contact/route.ts).
  const insertRow = {
    tenant_id: tenantId,
    user_id: claims.sub,
    match_id,
    signal,
  } as unknown as FeedbackInsert;

  const { error } = await db.from("prosp_match_feedback").insert(insertRow);
  if (error) {
    console.error("prospection_match_feedback_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "feedback_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
