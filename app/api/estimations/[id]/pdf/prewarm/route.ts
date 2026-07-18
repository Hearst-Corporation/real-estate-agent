/**
 * POST /api/estimations/[id]/pdf/prewarm
 *
 * Pré-génère le PDF en cache R2 via un job Inngest, SANS toucher le GET binaire
 * (qui reste la voie synchrone / fallback). Le front peut ensuite poller
 * pdf_status puis ouvrir le GET (cache HIT).
 *
 * - 401 non authentifié · 503 base GPU1 absente · 404 non possédée · 409 pas "ready"
 * - Inngest non configuré → 200 { status: 'sync_only' } (utiliser le GET directement)
 * - sinon → 202 { status: 'pending' } (job émis, idempotent sur id + updated_at)
 */

import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { rateLimit } from "@/lib/ratelimit";
import { inngest, inngestIsConfigured } from "@/lib/jobs/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const claims = await getSession();
  if (!claims) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return Response.json({ error: "database_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  if (!(await rateLimit(`pdfprewarm:${userId}`, 10, 60))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const row = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  if (row.status !== "ready" || !row.valuation) {
    return Response.json({ error: "not_ready" }, { status: 409 });
  }

  // Inngest absent → le client doit utiliser le GET synchrone (fallback).
  if (!inngestIsConfigured()) {
    return Response.json({ status: "sync_only" });
  }

  // Idempotence : même (id, updated_at) → un seul render ; un nouveau updated_at
  // (re-valorisation) → nouvel event, re-render légitime.
  const updatedAtMs = new Date(row.updated_at).getTime();
  await sb.from("estimations").update({ pdf_status: "pending" }).eq("id", id);
  await inngest.send({
    id: `pdf-${id}-${updatedAtMs}`,
    name: "estimation/pdf.prewarm",
    data: { estimationId: id },
  });

  return Response.json({ status: "pending" }, { status: 202 });
}
