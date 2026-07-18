/**
 * GET /api/learning/prospect?critere_id=…[&rank=true]
 *
 * Apprentissage commercial EXPLICABLE d'un prospect. Retourne :
 *   - profile : critères satisfaits / tolérés / bloquants dérivés des feedbacks
 *     RÉELS (prosp_match_feedback + offmarket_feedback + visit_reports), avec la
 *     preuve chiffrée (evidence) et une raison lisible par critère.
 *   - ranked  : si rank=true, les matchs du prospect re-classés par-dessus le
 *     moteur, avec "Pourquoi il a changé" (delta + raisons).
 *
 * Feedback absent → insufficientData=true (honnête, jamais de score inventé).
 * Sécurité : 401 avant DB, owner-check tenant_id + user_id sur CHAQUE requête,
 * Zod sur les query params, erreurs génériques 500, message DB neutre.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  collectFeedbackEvents,
  deriveLearningProfile,
  rankMatches,
  type RankableMatch,
} from "@/lib/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  critere_id: z.string().uuid(),
  rank: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    critere_id: searchParams.get("critere_id") ?? undefined,
    rank: searchParams.get("rank") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }
  const { critere_id: critereId, rank } = parsed.data;

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);

  // Owner-check : le critère DOIT appartenir au tenant + user (service-role bypass RLS).
  const { data: critere, error: critereError } = await db
    .from("prosp_criteres_acquereur")
    .select("id,lead_id")
    .eq("id", critereId)
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (critereError) {
    console.error("learning_critere_lookup_failed", { tenantId, code: critereError.code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!critere) {
    return NextResponse.json({ error: "critere_not_found" }, { status: 404 });
  }

  const leadId = (critere as Row).lead_id as string | null;

  // Collecte des feedbacks réels + dérivation du profil (déterministe, explicable).
  let events;
  try {
    events = await collectFeedbackEvents({
      db,
      tenantId,
      userId: claims.sub,
      critereId,
      leadId,
    });
  } catch (e) {
    console.error("learning_feedback_collect_failed", {
      tenantId,
      message: e instanceof Error ? e.message : "unknown",
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const profile = deriveLearningProfile(critereId, events);

  let ranked = null;
  if (rank) {
    const { data: matches, error: matchError } = await db
      .from("prosp_matchs")
      .select("id,score_match,score_breakdown")
      .eq("tenant_id", tenantId)
      .eq("user_id", claims.sub)
      .eq("critere_id", critereId)
      .limit(500);
    if (matchError) {
      console.error("learning_matches_fetch_failed", { tenantId, code: matchError.code });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    const rankable: RankableMatch[] = ((matches ?? []) as Row[]).map((m) => ({
      matchId: String(m.id),
      baseScore: Number(m.score_match) || 0,
      breakdown: (m.score_breakdown ?? {}) as Record<string, number>,
    }));
    ranked = rankMatches(rankable, profile);
  }

  return NextResponse.json({ profile, ranked });
}
