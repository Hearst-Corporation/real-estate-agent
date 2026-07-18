/**
 * GET /api/prospection/history — historique des PROPOSITIONS par acquéreur (LIVE).
 *
 * Source de vérité, 100 % réelle (aucune donnée fabriquée) :
 *   - `prosp_match_feedback` (colonne `signal` : like|dislike|contact|visite) —
 *     joint à `prosp_matchs` (critere_id, score_match) → `prosp_annonces`
 *     (titre/ville/prix). Un `like` = proposition retenue, `dislike` = refusée.
 *   - `prosp_contact_attempts` (statut draft/approved/sent/…) — tentatives de
 *     contact, rattachées au lead + annonce. Exposées telles quelles (un `draft`
 *     n'est JAMAIS un envoi réalisé — cf. règle de vérité).
 *
 * Agrégation par `critere_id` (= profil de recherche d'un acquéreur). Le front
 * regroupe ensuite les profils par acquéreur (lead_id).
 *
 * Sécurité : auth → 401 avant DB ; owner-check user_id + tenant_id sur chaque
 * lecture ; service-role jamais côté client.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnnonceLite = { id?: string; titre?: string | null; ville?: string | null; prix?: number | null };
type MatchLite = { id?: string; critere_id?: string | null; score_match?: number | null; annonce?: AnnonceLite | AnnonceLite[] | null };
type FeedbackRow = { id: string; signal: string; created_at: string; match?: MatchLite | MatchLite[] | null };

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const critereId = new URL(req.url).searchParams.get("critere_id");

  // ── 1. Signaux de proposition (feedback) ────────────────────────────────────
  // On récupère tous les signaux du user/tenant puis on filtre par critère côté
  // JS (le critere_id vit sur prosp_matchs, joint ici).
  const { data: fbData, error: fbErr } = await db
    .from("prosp_match_feedback")
    .select(
      "id,signal,created_at,match:prosp_matchs(id,critere_id,score_match,annonce:prosp_annonces(id,titre,ville,prix))",
    )
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: false })
    .limit(500);
  if (fbErr) {
    console.error("prospection_history_feedback_failed", { tenantId, userId: claims.sub, error: fbErr.message });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  // Le select typé renvoie SelectQueryError pour `signal` (types désynchronisés).
  // La donnée réelle est correcte → cast via unknown vers la forme attendue.
  const propositions = ((fbData ?? []) as unknown as FeedbackRow[])
    .map((row) => {
      const m = firstOf(row.match);
      const a = firstOf(m?.annonce ?? null);
      return {
        id: row.id,
        signal: row.signal,
        created_at: row.created_at,
        critere_id: m?.critere_id ?? null,
        match_id: m?.id ?? null,
        score_match: m?.score_match ?? null,
        annonce: a ? { id: a.id, titre: a.titre ?? null, ville: a.ville ?? null, prix: a.prix ?? null } : null,
      };
    })
    .filter((p) => (critereId ? p.critere_id === critereId : true));

  // ── 2. Tentatives de contact (draft/approved/sent/…) ────────────────────────
  const { data: attData, error: attErr } = await db
    .from("prosp_contact_attempts")
    .select("id,statut,canal,lead_id,annonce_id,created_at,sent_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: false })
    .limit(500);

  if (attErr) {
    console.error("prospection_history_attempts_failed", { tenantId, userId: claims.sub, error: attErr.message });
    // Non bloquant : on renvoie au moins les propositions.
  }

  const contactAttempts = ((attData ?? []) as Array<{
    id: string;
    statut: string;
    canal: string;
    lead_id: string | null;
    annonce_id: string | null;
    created_at: string;
    sent_at: string | null;
  }>).map((r) => ({
    id: r.id,
    statut: r.statut,
    canal: r.canal,
    lead_id: r.lead_id,
    annonce_id: r.annonce_id,
    created_at: r.created_at,
    sent_at: r.sent_at,
  }));

  return NextResponse.json({ data: { propositions, contactAttempts } });
}
