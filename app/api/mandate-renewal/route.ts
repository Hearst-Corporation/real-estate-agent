/**
 * GET /api/mandate-renewal
 *
 * Liste des mandats proches de l'expiration avec, pour chacun : résumé
 * d'activité, retours/objections, évolution marché et proposition de prochaine
 * action (DÉTERMINISTE, explicable). Lecture seule.
 *
 * - 401 si non authentifié (avant tout accès DB)
 * - 503 si DB non configurée
 *
 * Owner-check dur `user_id + tenant_id` (le client service-role bypass RLS).
 * Toutes les listes sont bornées (LIMIT).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { loadRenewalCandidates } from "@/lib/mandate-renewal/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  if (!(await rateLimit(`mandate-renewal:${userId}`, 30, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const db = getGpu1Admin();
  if (!db) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const items = await loadRenewalCandidates(db, userId, tenant);
    return NextResponse.json({ items }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
