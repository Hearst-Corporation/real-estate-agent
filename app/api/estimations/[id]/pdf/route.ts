/**
 * GET /api/estimations/[id]/pdf
 *
 * Génère (ou sert depuis le cache R2) le PDF A4 de la brochure en inline.
 * - 401 si non authentifié
 * - 503 si Supabase non configuré
 * - 404 si estimation non trouvée / n'appartient pas à l'utilisateur
 * - 409 si estimation pas encore à l'état "ready" (pas de valuation)
 * - 500 si erreur de rendu PDF
 *
 * Cache R2 :
 *   - Si estimation.pdf_key présent ET pdf_generated_at >= updated_at → sert
 *     directement depuis R2 (évite un re-render Chromium coûteux).
 *   - Sinon : render → upload R2 → update DB → renvoie le PDF.
 *   - Si R2 non configuré → fallback render sans cache.
 */

import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { r2IsConfigured, putObject, getObject, publicUrl } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/ratelimit";
import { captureFatal } from "@/lib/server/observe";
import type {
  Estimation,
  PropertyData,
  FieldStatusMap,
  MarketAnalysis,
  Valuation,
} from "@/lib/estimation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Supabase ──────────────────────────────────────────────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership check ───────────────────────────────────────────────────────
  const row = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!row) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // ── Rate-limit (10 req / 60 s per user) ──────────────────────────────────
  const allowed = await rateLimit(`pdf:${userId}`, 10, 60);
  if (!allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Status check ──────────────────────────────────────────────────────────
  if (row.status !== "ready" || !row.valuation) {
    return Response.json({ error: "not_ready" }, { status: 409 });
  }

  // ── R2 cache hit ──────────────────────────────────────────────────────────
  if (r2IsConfigured() && row.pdf_key && row.pdf_generated_at) {
    const generatedAt = new Date(row.pdf_generated_at).getTime();
    const updatedAt   = new Date(row.updated_at).getTime();

    if (generatedAt >= updatedAt) {
      try {
        const cached = await getObject(row.pdf_key);
        if (cached) {
          return new Response(cached as unknown as BodyInit, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="avis-valeur-${id}.pdf"`,
              "Cache-Control": "private, max-age=3600",
              "X-Cache": "HIT",
            },
          });
        }
        // Cache miss (object deleted from R2) → fall through to re-render
      } catch (err) {
        console.warn("[pdf/route] R2 getObject error, falling back to render:", err);
        // Fall through to re-render
      }
    }
  }

  // ── Reconstruct Estimation (snake_case row → camelCase) ───────────────────
  const estimation: Estimation = {
    id: row.id,
    userId: row.user_id ?? "",
    tenantId: row.tenant_id,
    status: row.status as Estimation["status"],
    property: (row.property ?? {}) as PropertyData,
    fieldStatus: (row.field_status ?? {}) as FieldStatusMap,
    market: (row.market ?? null) as MarketAnalysis | null,
    valuation: row.valuation as Valuation,
    saleStrategies: Array.isArray(row.sale_strategies)
      ? (row.sale_strategies as string[])
      : null,
    branding: (row.branding ?? null) as Record<string, unknown> | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  try {
    const { renderBrochureHtml } = await import("@/lib/brochure/render-html");
    const { renderEstimationPdf } = await import("@/lib/brochure/pdf");
    const html      = renderBrochureHtml(estimation);
    const pdfBuffer = await renderEstimationPdf(html);

    // ── Upload to R2 (best-effort — n'échoue pas la route si R2 KO) ─────────
    if (r2IsConfigured()) {
      const key       = `estimations/${id}/avis-${Date.now()}.pdf`;
      const pdfUrl    = publicUrl(key);
      const nowIso    = new Date().toISOString();
      try {
        await putObject(key, pdfBuffer as Buffer, "application/pdf");
        await sb
          .from("estimations")
          .update({ pdf_key: key, pdf_url: pdfUrl, pdf_generated_at: nowIso })
          .eq("id", id);
      } catch (err) {
        console.warn("[pdf/route] R2 upload/DB update failed (non-fatal):", err);
      }
    }

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="avis-valeur-${id}.pdf"`,
        "Cache-Control": "no-store",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "render_error";
    console.error("[pdf/route] render error:", err);
    captureFatal(err, "estimations/[id]/pdf");
    return Response.json({ error: message }, { status: 500 });
  }
}
