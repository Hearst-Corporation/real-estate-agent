/**
 * GET /api/owner-report?propertyId=<uuid>
 *
 * Tableau propriétaire (vue agent) : agrège l'activité RÉELLE de
 * commercialisation d'un bien sous mandat — visites, diffusions, retours de
 * visite, prochaines actions — depuis GPU1.
 *
 * - 401 si non authentifié (avant tout accès DB)
 * - 400 si propertyId absent / invalide
 * - 503 si DB non configurée
 * - 404 si le bien n'existe pas / n'appartient pas à l'utilisateur
 *
 * Owner-check dur `user_id + tenant_id` (le client service-role bypass RLS).
 * Lecture seule, toutes les listes sont bornées (LIMIT).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { loadOwnerReport } from "@/lib/owner-report/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  propertyId: z.string().uuid(),
});

export async function GET(req: Request) {
  // ── Auth (avant DB) ─────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  if (!(await rateLimit(`owner-report:${userId}`, 60, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Validation input ────────────────────────────────────────────────────
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    propertyId: url.searchParams.get("propertyId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  // ── DB ──────────────────────────────────────────────────────────────────
  const db = getGpu1Admin();
  if (!db) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const bundle = await loadOwnerReport(db, parsed.data.propertyId, userId, tenant);
    if (!bundle) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(bundle, { status: 200 });
  } catch {
    // Erreur générique : jamais de détail DB au client.
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
