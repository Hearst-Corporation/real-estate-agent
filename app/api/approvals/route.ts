import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { listApprovals, VIEWABLE_STATUSES } from "@/lib/approvals/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVALS_LIMIT = 100;

const QuerySchema = z.object({
  status: z.enum(VIEWABLE_STATUSES).default("pending"),
});

/**
 * GET /api/approvals — actions d'agents en attente (ou déjà tranchées) du tenant.
 * =============================================================================
 * Owner-check STRICT : 401 avant tout accès DB, filtrage `tenant_id` explicite
 * (le client admin bypass RLS), résultat borné (LIMIT). Fail-closed / honnête :
 * DB non configurée → 503 ; table non déployée → 200 { unavailable:true } (la
 * boîte affiche un état UNAVAILABLE, jamais de fausse approbation).
 */
export async function GET(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const result = await listApprovals(
    db,
    tenantOf(claims),
    parsed.data.status,
    APPROVALS_LIMIT,
  );

  if (!result.ok) {
    // Table 0045/0049 non déployée ou erreur DB → état honnête, pas de 500 bruyant.
    return NextResponse.json({ unavailable: true, items: [] });
  }

  return NextResponse.json({ items: result.rows });
}
